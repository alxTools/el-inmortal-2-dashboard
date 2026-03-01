#!/usr/bin/env python3

import argparse
import csv
import secrets
import string
import subprocess
from pathlib import Path


def random_password(length: int = 24) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def build_compose(
    project: str,
    pia_user: str,
    pia_pass: str,
    country: str,
    region: str,
    count: int,
    base_port: int,
    proxy_user_prefix: str,
    fixed_proxy_pass: str,
    server_names: list,
    credentials_path: Path,
) -> str:
    services = []

    with credentials_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["name", "host", "port", "proxy_user", "proxy_pass", "proxy_url"])

        for i in range(1, count + 1):
            suffix = f"{i:02d}"
            service_name = f"proxy_{suffix}"
            container_name = f"{project}-{suffix}"
            port = base_port + (i - 1)
            proxy_user = f"{proxy_user_prefix}{i}"
            proxy_pass = fixed_proxy_pass if fixed_proxy_pass else random_password(24)
            proxy_url = f"http://{proxy_user}:{proxy_pass}@172.235.135.231:{port}"

            writer.writerow([container_name, "172.235.135.231", port, proxy_user, proxy_pass, proxy_url])

            service = f"""  {service_name}:
    image: qmcgaw/gluetun:latest
    container_name: {container_name}
    restart: unless-stopped
    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun:/dev/net/tun
    ports:
      - \"{port}:8888/tcp\"
    environment:
      - VPN_SERVICE_PROVIDER=private internet access
      - VPN_TYPE=openvpn
      - OPENVPN_USER={pia_user}
      - OPENVPN_PASSWORD={pia_pass}
      - HTTPPROXY=on
      - HTTPPROXY_USER={proxy_user}
      - HTTPPROXY_PASSWORD={proxy_pass}
      - HTTPPROXY_STEALTH=on
      - TZ=America/Puerto_Rico
"""
            if server_names:
                selected = server_names[(i - 1) % len(server_names)]
                service = service.rstrip() + f"\n      - SERVER_NAMES={selected}\n"
            else:
                if country:
                    service = service.rstrip() + f"\n      - SERVER_COUNTRIES={country}\n"
                if region:
                    service = service.rstrip() + f"\n      - SERVER_REGIONS={region}\n"
            services.append(service)

    compose = "version: '3.7'\n\nservices:\n" + "\n".join(services)
    return compose


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy a stack of PIA HTTP proxy containers")
    parser.add_argument("--pia-user", required=True)
    parser.add_argument("--pia-pass", required=True)
    parser.add_argument("--country", default="")
    parser.add_argument("--region", default="")
    parser.add_argument("--count", type=int, default=20)
    parser.add_argument("--base-port", type=int, default=3128)
    parser.add_argument("--project", default="pia20")
    parser.add_argument("--proxy-user-prefix", default="px")
    parser.add_argument("--proxy-pass-fixed", default="")
    parser.add_argument("--server-names", default="", help="Comma-separated server names, e.g. newjersey433,atlanta411")
    args = parser.parse_args()

    if args.count < 1 or args.count > 20:
        raise SystemExit("--count must be between 1 and 20")

    output_dir = Path(__file__).resolve().parent / "generated" / args.project
    output_dir.mkdir(parents=True, exist_ok=True)

    compose_path = output_dir / "docker-compose.yml"
    credentials_path = output_dir / "proxy-credentials.csv"

    server_names = [x.strip() for x in args.server_names.split(",") if x.strip()]

    compose = build_compose(
        project=args.project,
        pia_user=args.pia_user,
        pia_pass=args.pia_pass,
        country=args.country,
        region=args.region,
        count=args.count,
        base_port=args.base_port,
        proxy_user_prefix=args.proxy_user_prefix,
        fixed_proxy_pass=args.proxy_pass_fixed,
        server_names=server_names,
        credentials_path=credentials_path,
    )
    compose_path.write_text(compose, encoding="utf-8")

    subprocess.run(
        ["docker-compose", "-f", str(compose_path), "-p", args.project, "up", "-d"],
        check=True,
    )

    print(f"Stack deployed: {args.project}")
    print(f"Compose: {compose_path}")
    print(f"Credentials: {credentials_path}")


if __name__ == "__main__":
    main()
