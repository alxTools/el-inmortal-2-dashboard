#!/usr/bin/env python3

import argparse
import csv
import json
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


TOP_LEVEL_TEMPLATE = {
    "mode": "disabled",
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
    "data": [],
}


def rows_from_csv(path: Path):
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            yield {
                "name": row.get("name", "").strip(),
                "host": row.get("host", "").strip(),
                "port": row.get("port", "").strip(),
                "proxy_user": row.get("proxy_user", "").strip(),
                "proxy_pass": row.get("proxy_pass", "").strip(),
                "cc": row.get("cc", "").strip(),
                "city": row.get("city", "").strip(),
            }


def choose_source(primary: Path) -> Path:
    if primary.exists():
        return primary
    fallback = primary.parent / "proxy-credentials.csv"
    if fallback.exists():
        return fallback
    raise FileNotFoundError(f"No source CSV found for {primary.parent}")


def build_foxyproxy_payload(rows, profile_suffix: str, fallback_cc: str) -> dict:
    payload = dict(TOP_LEVEL_TEMPLATE)
    payload["commands"] = dict(TOP_LEVEL_TEMPLATE["commands"])

    data = []
    for row in rows:
        cc = row.get("cc", "") or fallback_cc
        data.append(
            {
                "active": True,
                "title": f"{row.get('proxy_user', '')}-{profile_suffix}",
                "type": "http",
                "hostname": row.get("host", ""),
                "port": str(row.get("port", "")),
                "username": row.get("proxy_user", ""),
                "password": row.get("proxy_pass", ""),
                "cc": cc,
                "city": row.get("city", ""),
                "color": "#ffa500",
                "pac": "",
                "pacString": "",
                "proxyDNS": True,
                "include": [],
                "exclude": [],
                "tabProxy": [],
            }
        )

    payload["data"] = data
    if data:
        payload["mode"] = f"{data[0]['hostname']}:{data[0]['port']}"
    return payload


def write_json_payload(source: Path, destination: Path, profile_suffix: str, fallback_cc: str) -> int:
    rows = list(rows_from_csv(source))
    payload = build_foxyproxy_payload(rows, profile_suffix=profile_suffix, fallback_cc=fallback_cc)
    tmp_path = destination.with_suffix(destination.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    tmp_path.replace(destination)
    return len(rows)


def refresh_once(latam_source: Path, us_source: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    latam_count = write_json_payload(
        choose_source(latam_source),
        output_dir / "proxy-credentials-latam.json",
        profile_suffix="latam",
        fallback_cc="",
    )
    us_count = write_json_payload(
        choose_source(us_source),
        output_dir / "proxy-credentials-us.json",
        profile_suffix="us",
        fallback_cc="US",
    )

    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{stamp}] updated latam={latam_count} us={us_count}", flush=True)


def serve(output_dir: Path, bind: str, port: int) -> None:
    handler = partial(SimpleHTTPRequestHandler, directory=str(output_dir))
    with ThreadingHTTPServer((bind, port), handler) as httpd:
        print(f"Serving {output_dir} on http://{bind}:{port}", flush=True)
        httpd.serve_forever()


def main() -> None:
    base = Path(__file__).resolve().parent

    parser = argparse.ArgumentParser(description="Publish LATAM/US proxy credential CSVs and serve them over HTTP")
    parser.add_argument("--latam-source", default=str(base / "generated" / "pia15-box2-latam" / "proxy-ready-latest.csv"))
    parser.add_argument("--us-source", default=str(base / "generated" / "pia15-box1-us" / "proxy-ready-latest.csv"))
    parser.add_argument("--output-dir", default=str(base / "published"))
    parser.add_argument("--interval", type=int, default=30)
    parser.add_argument("--serve", action="store_true")
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8899)
    args = parser.parse_args()

    latam_source = Path(args.latam_source)
    us_source = Path(args.us_source)
    output_dir = Path(args.output_dir)

    refresh_once(latam_source, us_source, output_dir)

    if args.serve:
        from threading import Event, Thread

        stop = Event()

        def loop() -> None:
            while not stop.wait(max(5, args.interval)):
                try:
                    refresh_once(latam_source, us_source, output_dir)
                except Exception as exc:  # noqa: BLE001
                    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
                    print(f"[{stamp}] refresh error: {exc}", flush=True)

        t = Thread(target=loop, daemon=True)
        t.start()

        try:
            serve(output_dir, args.bind, args.port)
        finally:
            stop.set()
    else:
        while True:
            time.sleep(max(5, args.interval))
            refresh_once(latam_source, us_source, output_dir)


if __name__ == "__main__":
    main()
