#!/usr/bin/env python3

import argparse
import csv
import json
import re
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path


def run(cmd, timeout=20):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        class _R:
            returncode = 124
            stdout = ""
            stderr = "timeout"

        return _R()


def get_server_public_ip():
    p = run(["curl", "-s", "--max-time", "10", "https://api.ipify.org"], timeout=15)
    return p.stdout.strip() if p.returncode == 0 else ""


def docker_status(container_name):
    fmt = "{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}"
    p = run(["docker", "inspect", "--format", fmt, container_name], timeout=20)
    if p.returncode != 0:
        return False, "missing"
    raw = p.stdout.strip()
    parts = raw.split("|", 1)
    running = parts[0].lower() == "true"
    health = parts[1] if len(parts) > 1 else "unknown"
    return running, health


def docker_server_name(container_name):
    p = run(["docker", "logs", "--tail", "120", container_name], timeout=15)
    text = (p.stdout or "") + (p.stderr or "")
    matches = re.findall(r"\[([^\]]+)\] Peer Connection Initiated", text)
    return matches[-1] if matches else ""


def server_to_location(server_name):
    if not server_name:
        return "", "", ""
    s = server_name.lower()
    if s.startswith("newjersey"):
        return server_name, "New Jersey", "US"
    if s.startswith("newyork"):
        return server_name, "New York", "US"
    if s.startswith("florida"):
        return server_name, "Florida", "US"
    if s.startswith("chicago"):
        return server_name, "Chicago", "US"
    if s.startswith("dallas"):
        return server_name, "Dallas", "US"
    if s.startswith("seattle"):
        return server_name, "Seattle", "US"
    if s.startswith("lasvegas"):
        return server_name, "Las Vegas", "US"
    if s.startswith("atlanta"):
        return server_name, "Atlanta", "US"
    return server_name, "", ""


def probe_proxy(host, port, user, password, timeout_seconds):
    proxy = f"http://{user}:{password}@{host}:{port}"
    p = run(
        ["curl", "--proxy", proxy, "--max-time", str(timeout_seconds), "-s", "https://api.ipify.org"],
        timeout=timeout_seconds + 5,
    )
    ip = p.stdout.strip()
    if p.returncode == 0 and ip:
        return True, ip, ""
    return False, "", (p.stderr.strip() or f"curl_exit_{p.returncode}")


def geolocate_ip(ip):
    if not ip:
        return "", ""
    p = run(["curl", "-s", "--max-time", "10", f"https://ipwho.is/{ip}"], timeout=15)
    if p.returncode != 0 or not p.stdout.strip():
        return "", ""
    try:
        data = json.loads(p.stdout)
    except json.JSONDecodeError:
        return "", ""
    if not data.get("success", False):
        return "", ""
    city = data.get("city") or ""
    cc = data.get("country_code") or ""
    return city, cc


def check_one(row, server_ip, timeout_seconds):
    name = row["name"]
    host = row["host"]
    port = row["port"]
    user = row["proxy_user"]
    password = row["proxy_pass"]

    running, health = docker_status(name)
    server_name = docker_server_name(name)
    server_code, city, cc = server_to_location(server_name)
    ok, vpn_ip, err = probe_proxy(host, port, user, password, timeout_seconds)
    if ok and vpn_ip and (not city or not cc):
        geo_city, geo_cc = geolocate_ip(vpn_ip)
        city = city or geo_city
        cc = cc or geo_cc
    ready = running and ok and vpn_ip and vpn_ip != server_ip

    return {
        "name": name,
        "host": host,
        "port": port,
        "proxy_user": user,
        "proxy_pass": password,
        "docker_running": running,
        "docker_health": health,
        "server_name": server_code,
        "city": city,
        "cc": cc,
        "vpn_ip": vpn_ip,
        "ready": ready,
        "error": "" if ready else err,
        "proxy_url": f"http://{user}:{password}@{host}:{port}",
    }


def restart_container(name):
    p = run(["docker", "restart", name], timeout=30)
    return p.returncode == 0


def discover_latest_csv(base_dir: Path):
    candidates = sorted(base_dir.glob("*/proxy-credentials.csv"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not candidates:
        raise FileNotFoundError(f"No proxy-credentials.csv found in {base_dir}")
    return candidates[0]


def write_reports(results, output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    all_csv = output_dir / f"proxy-check-{ts}.csv"
    ready_csv = output_dir / f"proxy-ready-{ts}.csv"
    json_file = output_dir / f"proxy-check-{ts}.json"

    fields = [
        "name",
        "host",
        "port",
        "proxy_user",
        "proxy_pass",
        "docker_running",
        "docker_health",
        "server_name",
        "city",
        "cc",
        "vpn_ip",
        "ready",
        "error",
        "proxy_url",
    ]

    with all_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(results)

    ready_rows = [r for r in results if r["ready"]]
    with ready_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(ready_rows)

    with json_file.open("w", encoding="utf-8") as f:
        json.dump({"checked_at_utc": ts, "total": len(results), "ready": len(ready_rows), "results": results}, f, indent=2)

    foxy_file = output_dir / f"foxyproxy-ready-{ts}.json"
    mode = "disabled"
    if ready_rows:
        mode = f"{ready_rows[0]['host']}:{ready_rows[0]['port']}"
    foxy_data = {
        "mode": mode,
        "sync": False,
        "autoBackup": False,
        "passthrough": "",
        "theme": "",
        "container": {},
        "commands": {
            "setProxy": "",
            "setTabProxy": "",
            "includeHost": "",
            "excludeHost": "",
        },
        "data": [
            {
                "active": True,
                "title": r["proxy_user"],
                "type": "http",
                "hostname": r["host"],
                "port": str(r["port"]),
                "username": r["proxy_user"],
                "password": r["proxy_pass"],
                "cc": r.get("cc", ""),
                "city": r.get("city", ""),
                "color": "#006400",
                "pac": "",
                "pacString": "",
                "proxyDNS": True,
                "include": [],
                "exclude": [],
                "tabProxy": [],
            }
            for r in ready_rows
        ],
    }
    with foxy_file.open("w", encoding="utf-8") as f:
        json.dump(foxy_data, f, indent=2)

    (output_dir / "proxy-check-latest.csv").write_text(all_csv.read_text(encoding="utf-8"), encoding="utf-8")
    (output_dir / "proxy-ready-latest.csv").write_text(ready_csv.read_text(encoding="utf-8"), encoding="utf-8")
    (output_dir / "proxy-check-latest.json").write_text(json_file.read_text(encoding="utf-8"), encoding="utf-8")
    (output_dir / "foxyproxy-ready-latest.json").write_text(foxy_file.read_text(encoding="utf-8"), encoding="utf-8")

    return all_csv, ready_csv, json_file, foxy_file


def main():
    parser = argparse.ArgumentParser(description="Check proxy pool readiness and VPN IPs")
    parser.add_argument("--input", default="", help="Path to proxy-credentials.csv")
    parser.add_argument("--generated-dir", default="/home/gtalx/el-inmortal-2-dashboard/scripts/proxy/generated")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--timeout", type=int, default=12)
    parser.add_argument("--heal", action="store_true", help="Restart non-ready containers once and recheck")
    args = parser.parse_args()

    input_csv = Path(args.input) if args.input else discover_latest_csv(Path(args.generated_dir))
    output_dir = input_csv.parent

    with input_csv.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    server_ip = get_server_public_ip()

    results = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
        futs = [ex.submit(check_one, r, server_ip, args.timeout) for r in rows]
        for fut in as_completed(futs):
            results.append(fut.result())

    results.sort(key=lambda r: r["name"])

    if args.heal:
        to_restart = [r["name"] for r in results if not r["ready"]]
        for name in to_restart:
            restart_container(name)
        if to_restart:
            time.sleep(15)
            healed = []
            with ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
                futs = [ex.submit(check_one, next(x for x in rows if x["name"] == name), server_ip, args.timeout) for name in to_restart]
                for fut in as_completed(futs):
                    healed.append(fut.result())
            by_name = {r["name"]: r for r in results}
            for r in healed:
                by_name[r["name"]] = r
            results = sorted(by_name.values(), key=lambda r: r["name"])

    all_csv, ready_csv, json_file, foxy_file = write_reports(results, output_dir)

    total = len(results)
    ready = sum(1 for r in results if r["ready"])
    print(f"Input: {input_csv}")
    print(f"Server IP: {server_ip}")
    print(f"Ready: {ready}/{total}")
    print(f"All report: {all_csv}")
    print(f"Ready report: {ready_csv}")
    print(f"JSON report: {json_file}")
    print(f"FoxyProxy JSON: {foxy_file}")

    for r in results:
        if r["ready"]:
            loc = r.get("city", "") or r.get("server_name", "") or "unknown"
            print(f"READY {r['name']} {r['proxy_user']}:{r['proxy_pass']} {r['host']}:{r['port']} vpn_ip={r['vpn_ip']} location={loc}")
        else:
            print(f"DOWN  {r['name']} {r['proxy_user']}:{r['proxy_pass']} {r['host']}:{r['port']} reason={r['error'] or r['docker_health']}")


if __name__ == "__main__":
    main()
