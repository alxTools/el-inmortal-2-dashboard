#!/usr/bin/env python3

import argparse
import csv
import shlex
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Account:
    box_id: str
    pia_user: str
    pia_pass: str
    email: str


def prompt_text(label: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    raw = input(f"{label}{suffix}: ").strip()
    return raw if raw else default


def prompt_int(label: str, default: int, min_value: int, max_value: int) -> int:
    while True:
        raw = prompt_text(label, str(default))
        try:
            value = int(raw)
        except ValueError:
            print("  -> Enter a valid integer")
            continue
        if value < min_value or value > max_value:
            print(f"  -> Value must be between {min_value} and {max_value}")
            continue
        return value


def prompt_yes_no(label: str, default: bool = True) -> bool:
    default_text = "Y/n" if default else "y/N"
    while True:
        raw = input(f"{label} [{default_text}]: ").strip().lower()
        if not raw:
            return default
        if raw in {"y", "yes"}:
            return True
        if raw in {"n", "no"}:
            return False
        print("  -> Answer with y or n")


def load_accounts(csv_path: Path) -> list[Account]:
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    records: list[Account] = []
    seen_users = set()

    with csv_path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            pia_user = (row.get("pia_user") or "").strip()
            pia_pass = (row.get("pia_pass") or "").strip()
            if not pia_user or not pia_pass:
                continue
            if pia_user in seen_users:
                continue
            seen_users.add(pia_user)
            records.append(
                Account(
                    box_id=(row.get("box_id") or "").strip(),
                    pia_user=pia_user,
                    pia_pass=pia_pass,
                    email=(row.get("email") or "").strip(),
                )
            )

    def _sort_key(a: Account):
        try:
            return (0, int(a.box_id.replace("box", "")))
        except Exception:
            return (1, a.box_id or "zzzz")

    records.sort(key=_sort_key)
    return records


def build_deploy_cmd(
    python_bin: str,
    deploy_script: Path,
    account: Account,
    count: int,
    base_port: int,
    project: str,
    proxy_user_prefix: str,
    proxy_pass_fixed: str,
    mode: str,
    mode_value: str,
) -> list[str]:
    cmd = [
        python_bin,
        str(deploy_script),
        "--pia-user",
        account.pia_user,
        "--pia-pass",
        account.pia_pass,
        "--count",
        str(count),
        "--base-port",
        str(base_port),
        "--project",
        project,
        "--proxy-user-prefix",
        proxy_user_prefix,
    ]

    if proxy_pass_fixed:
        cmd += ["--proxy-pass-fixed", proxy_pass_fixed]

    if mode == "region" and mode_value:
        cmd += ["--region", mode_value]
    elif mode == "country" and mode_value:
        cmd += ["--country", mode_value]
    elif mode == "server_names" and mode_value:
        cmd += ["--server-names", mode_value]

    return cmd


def run_cmd(cmd: list[str]) -> int:
    print(f"\n$ {' '.join(shlex.quote(x) for x in cmd)}")
    try:
        completed = subprocess.run(cmd, check=False)
        return completed.returncode
    except KeyboardInterrupt:
        return 130


def parse_args() -> argparse.Namespace:
    script_dir = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Interactive/non-interactive multi-box deploy tool")
    parser.add_argument("--non-interactive", action="store_true", help="Run without prompts")
    parser.add_argument("--csv-path", default=str(script_dir / "pia-accounts-inventory.csv"))
    parser.add_argument("--start-index", type=int, default=1, help="1-based account index")
    parser.add_argument("--boxes", type=int, default=0, help="How many accounts/boxes to deploy")
    parser.add_argument("--tunnels-per-box", type=int, default=15)
    parser.add_argument("--first-base-port", type=int, default=3128)
    parser.add_argument("--project-prefix", default="")
    parser.add_argument("--proxy-prefix-template", default="vpx{n}")
    parser.add_argument("--fixed-proxy-pass", default="x0")
    parser.add_argument("--mode", choices=["region", "country", "server_names"], default="region")
    parser.add_argument("--mode-value", default="")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--heal", dest="heal", action="store_true")
    parser.add_argument("--no-heal", dest="heal", action="store_false")
    parser.set_defaults(heal=True)
    parser.add_argument("--auto-continue", action="store_true", help="Skip final Proceed prompt")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    script_dir = Path(__file__).resolve().parent
    deploy_script = script_dir / "deploy_pia_stack.py"
    check_script = script_dir / "check_proxy_pool.py"
    default_csv = Path(args.csv_path)

    print("=== PIA Boxes Deploy TUI ===")
    print("Deploy multiple boxes from credentials CSV in one flow.\n")

    missing = [cmd for cmd in ("docker", "docker-compose") if shutil.which(cmd) is None]
    if missing:
        print(f"Warning: missing required binaries: {', '.join(missing)}")
        print("Install Docker + docker-compose before deploying boxes.")
        if args.non_interactive:
            return 1
        if not prompt_yes_no("Continue anyway", False):
            return 1

    csv_input = str(default_csv) if args.non_interactive else prompt_text("Credentials CSV path", str(default_csv))
    csv_path = Path(csv_input).expanduser().resolve()

    try:
        accounts = load_accounts(csv_path)
    except Exception as exc:
        print(f"Error: {exc}")
        return 1

    if not accounts:
        print("No valid accounts found (pia_user/pia_pass).")
        return 1

    print(f"Loaded {len(accounts)} accounts from {csv_path}")

    start_1based = args.start_index if args.non_interactive else prompt_int("Start account index (1-based)", 1, 1, len(accounts))
    if start_1based < 1 or start_1based > len(accounts):
        print(f"Invalid start index: {start_1based}. Must be 1-{len(accounts)}")
        return 1
    start_index = start_1based - 1
    remaining = len(accounts) - start_index
    boxes_default = min(20, remaining)
    boxes = (args.boxes or boxes_default) if args.non_interactive else prompt_int("How many boxes to deploy", boxes_default, 1, remaining)
    if boxes < 1 or boxes > remaining:
        print(f"Invalid boxes value: {boxes}. Must be 1-{remaining}")
        return 1

    tunnels_per_box = args.tunnels_per_box if args.non_interactive else prompt_int("Tunnels per box", 15, 1, 20)
    if tunnels_per_box < 1 or tunnels_per_box > 20:
        print("Invalid tunnels per box. Must be 1-20")
        return 1

    first_base_port = args.first_base_port if args.non_interactive else prompt_int("First base port", 3128, 1024, 65000)
    if first_base_port < 1024 or first_base_port > 65000:
        print("Invalid first base port. Must be 1024-65000")
        return 1

    default_project_prefix = f"pia{tunnels_per_box}"
    project_prefix = (
        args.project_prefix or default_project_prefix
        if args.non_interactive
        else prompt_text("Project prefix", default_project_prefix)
    )
    proxy_prefix_template = args.proxy_prefix_template if args.non_interactive else prompt_text("Proxy user prefix template (use {n} for box number)", "vpx{n}")
    fixed_proxy_pass = args.fixed_proxy_pass if args.non_interactive else prompt_text("Fixed proxy password (blank = random)", "x0")

    if args.non_interactive:
        mode = args.mode
        if args.mode_value:
            mode_value = args.mode_value
        elif mode == "region":
            mode_value = "US East"
        elif mode == "country":
            mode_value = "United States"
        else:
            mode_value = ""
    else:
        print("\nServer selection mode:")
        print("  1) region")
        print("  2) country")
        print("  3) explicit server_names")
        mode_choice = prompt_int("Choose mode", 1, 1, 3)
        mode = {1: "region", 2: "country", 3: "server_names"}[mode_choice]
        if mode == "region":
            mode_value = prompt_text("Region", "US East")
        elif mode == "country":
            mode_value = prompt_text("Country", "United States")
        else:
            mode_value = prompt_text("Comma-separated server_names", "")

    if mode == "server_names" and not mode_value:
        print("Mode server_names requires --mode-value with comma-separated names")
        return 1

    dry_run = args.dry_run if args.non_interactive else prompt_yes_no("Dry run only (print commands, do not execute)", False)

    selected = accounts[start_index : start_index + boxes]
    print("\nDeployment plan:")
    for idx, account in enumerate(selected, start=1):
        box_label = account.box_id or f"box{start_index + idx}"
        project = f"{project_prefix}-{box_label}"
        base_port = first_base_port + (idx - 1) * tunnels_per_box
        print(
            f"  - {project}: account={account.pia_user} ports={base_port}-{base_port + tunnels_per_box - 1}"
        )

    if not args.non_interactive and not args.auto_continue:
        if not prompt_yes_no("Proceed", True):
            print("Cancelled.")
            return 0

    python_bin = sys.executable or "python3"
    generated_paths = []

    for idx, account in enumerate(selected, start=1):
        box_number = account.box_id or f"box{start_index + idx}"
        project = f"{project_prefix}-{box_number}"
        base_port = first_base_port + (idx - 1) * tunnels_per_box
        proxy_user_prefix = proxy_prefix_template.replace("{n}", str(idx))

        cmd = build_deploy_cmd(
            python_bin=python_bin,
            deploy_script=deploy_script,
            account=account,
            count=tunnels_per_box,
            base_port=base_port,
            project=project,
            proxy_user_prefix=proxy_user_prefix,
            proxy_pass_fixed=fixed_proxy_pass,
            mode=mode,
            mode_value=mode_value,
        )

        generated_paths.append(script_dir / "generated" / project / "proxy-credentials.csv")

        if dry_run:
            print(f"$ {' '.join(shlex.quote(x) for x in cmd)}")
            continue

        rc = run_cmd(cmd)
        if rc != 0:
            print(f"Deployment failed for project {project} (exit {rc})")
            return rc

    if dry_run:
        print("\nDry run complete.")
        return 0

    run_heal = args.heal if args.non_interactive else prompt_yes_no("Run health check + heal for each new box", True)
    if run_heal:
        for credentials_csv in generated_paths:
            if not credentials_csv.exists():
                print(f"Skipping missing credentials file: {credentials_csv}")
                continue
            cmd = [
                python_bin,
                str(check_script),
                "--input",
                str(credentials_csv),
                "--workers",
                "8",
                "--timeout",
                "12",
                "--heal",
            ]
            rc = run_cmd(cmd)
            if rc != 0:
                print(f"Health check failed for {credentials_csv}")

    print("\nDone.")
    print("Mission Control reads latest snapshots from scripts/proxy/generated/<project>/proxy-check-latest.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
