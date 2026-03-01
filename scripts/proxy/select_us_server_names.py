#!/usr/bin/env python3

import argparse
import json
import subprocess
from collections import OrderedDict


def run(cmd):
    return subprocess.check_output(cmd, text=True)


def main():
    parser = argparse.ArgumentParser(description="Select diverse US PIA server names from gluetun database")
    parser.add_argument("--container", default="pia15-vpx-01", help="Running gluetun container name")
    parser.add_argument("--count", type=int, default=15)
    parser.add_argument("--print-regions", action="store_true")
    args = parser.parse_args()

    raw = run(["docker", "exec", args.container, "cat", "/gluetun/servers.json"])
    data = json.loads(raw)
    servers = data["private internet access"]["servers"]

    us = [
        s
        for s in servers
        if s.get("region", "").startswith("US ")
        and "Streaming Optimized" not in s.get("region", "")
        and s.get("server_name")
        and not str(s.get("server_name", "")).lower().startswith("server-")
    ]

    by_region = OrderedDict()
    for s in sorted(us, key=lambda x: (x.get("region", ""), x.get("server_name", ""))):
        r = s["region"]
        by_region.setdefault(r, s)

    picked = list(by_region.values())
    picked = picked[: args.count]

    names = [s["server_name"] for s in picked]
    print(",".join(names))
    if args.print_regions:
        for s in picked:
            print(f"{s['server_name']},{s['region']}")


if __name__ == "__main__":
    main()
