#!/usr/bin/env python3

import argparse
import json
import shlex
import subprocess
from pathlib import Path


def run(cmd: list[str]) -> int:
    print("$", " ".join(shlex.quote(x) for x in cmd))
    return subprocess.run(cmd, check=False).returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="Roll out opencode workers across VMs via SSH")
    parser.add_argument("--hosts", required=True, help="JSON file with ssh targets and per-host settings")
    parser.add_argument("--ssh-key", default="", help="Optional SSH private key path")
    parser.add_argument("--image", default="opencode-worker:latest")
    parser.add_argument("--script", default="scripts/proxy/opencode_cluster/bootstrap_worker_vm.sh")
    args = parser.parse_args()

    hosts = json.loads(Path(args.hosts).read_text(encoding="utf-8"))
    script_path = Path(args.script).resolve()
    if not script_path.exists():
        print(f"Bootstrap script not found: {script_path}")
        return 1

    failed = 0
    for h in hosts:
        name = h["name"]
        user = h.get("ssh_user", "root")
        host = h["ssh_host"]
        port = str(h.get("ssh_port", 22))
        tavily_key = h.get("tavily_api_key", "")
        server_password = h["server_password"]
        server_username = h.get("server_username", "opencode")
        worker_port = str(h.get("worker_port", 4096))
        model = h.get("model", "openai/gpt-5")

        remote_script = f"/tmp/bootstrap_worker_vm_{name}.sh"

        ssh_base = ["ssh", "-p", port]
        scp_base = ["scp", "-P", port]
        if args.ssh_key:
            ssh_base += ["-i", args.ssh_key]
            scp_base += ["-i", args.ssh_key]

        target = f"{user}@{host}"

        rc = run(scp_base + [str(script_path), f"{target}:{remote_script}"])
        if rc != 0:
            failed += 1
            print(f"[{name}] failed copying bootstrap script")
            continue

        remote_cmd = [
            "sudo",
            "bash",
            remote_script,
            "--tavily-api-key",
            tavily_key,
            "--server-password",
            server_password,
            "--server-username",
            server_username,
            "--port",
            worker_port,
            "--model",
            model,
            "--image",
            args.image,
        ]

        rc = run(ssh_base + [target, " ".join(shlex.quote(x) for x in remote_cmd)])
        if rc != 0:
            failed += 1
            print(f"[{name}] bootstrap failed")
            continue

        print(f"[{name}] worker deployed")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
