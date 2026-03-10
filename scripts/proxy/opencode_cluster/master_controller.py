#!/usr/bin/env python3

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests


@dataclass
class Worker:
    name: str
    url: str
    username: str
    password: str


def load_workers(path: Path) -> List[Worker]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    workers: List[Worker] = []
    for item in raw:
        workers.append(
            Worker(
                name=item["name"],
                url=item["url"].rstrip("/"),
                username=item.get("username", "opencode"),
                password=item["password"],
            )
        )
    return workers


def req(worker: Worker, method: str, path: str, timeout: int, body: Optional[Dict[str, Any]] = None) -> requests.Response:
    return requests.request(
        method=method,
        url=f"{worker.url}{path}",
        json=body,
        timeout=timeout,
        auth=(worker.username, worker.password),
    )


def health(workers: List[Worker], timeout: int) -> int:
    failed = 0
    for worker in workers:
        try:
            r = req(worker, "GET", "/global/health", timeout)
            if r.ok:
                payload = r.json()
                print(f"OK   {worker.name:16} healthy={payload.get('healthy')} version={payload.get('version')}")
            else:
                failed += 1
                print(f"FAIL {worker.name:16} status={r.status_code} body={r.text[:140]}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL {worker.name:16} error={exc}")
    return 1 if failed else 0


def ensure_tavily_mcp(worker: Worker, tavily_api_key: Optional[str], timeout: int) -> None:
    if not tavily_api_key:
        return
    body = {
        "name": "tavily",
        "config": {
            "type": "remote",
            "url": f"https://mcp.tavily.com/mcp/?tavilyApiKey={tavily_api_key}",
            "oauth": False,
            "enabled": True,
        },
    }
    r = req(worker, "POST", "/mcp", timeout, body)
    if not r.ok:
        raise RuntimeError(f"mcp add failed status={r.status_code} body={r.text[:300]}")


def run_prompt(worker: Worker, prompt: str, timeout: int, tavily_api_key: Optional[str] = None) -> str:
    ensure_tavily_mcp(worker, tavily_api_key=tavily_api_key, timeout=timeout)

    create = req(worker, "POST", "/session", timeout, {})
    if not create.ok:
        raise RuntimeError(f"session create failed status={create.status_code} body={create.text[:300]}")
    session_id = create.json()["id"]

    body = {
        "parts": [
            {
                "type": "text",
                "text": prompt,
            }
        ]
    }
    ask = req(worker, "POST", f"/session/{session_id}/message", timeout, body)
    if not ask.ok:
        raise RuntimeError(f"prompt failed status={ask.status_code} body={ask.text[:300]}")

    payload = ask.json()
    parts = payload.get("parts", [])
    text_chunks = [p.get("text", "") for p in parts if p.get("type") == "text" and p.get("text")]
    return "\n".join(text_chunks).strip()


def broadcast(workers: List[Worker], prompt: str, timeout: int, tavily_api_key: Optional[str]) -> int:
    failed = 0
    for worker in workers:
        try:
            response = run_prompt(worker, prompt=prompt, timeout=timeout, tavily_api_key=tavily_api_key)
            print(f"\n===== {worker.name} =====")
            print(response or "(empty response)")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"\n===== {worker.name} FAILED =====")
            print(str(exc))
    return 1 if failed else 0


def chain(workers: List[Worker], prompt: str, timeout: int, tavily_api_key: Optional[str]) -> int:
    current = prompt
    for worker in workers:
        try:
            response = run_prompt(worker, prompt=current, timeout=timeout, tavily_api_key=tavily_api_key)
            print(f"\n===== {worker.name} =====")
            print(response or "(empty response)")
            current = (
                "Improve and expand this output. Verify important claims using Tavily MCP tools.\n\n"
                + (response or "No output from previous worker.")
            )
        except Exception as exc:  # noqa: BLE001
            print(f"\n===== {worker.name} FAILED =====")
            print(str(exc))
            return 1
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Master controller for OpenCode worker fleet")
    sub = parser.add_subparsers(dest="command", required=True)

    def add_common_flags(p: argparse.ArgumentParser) -> None:
        p.add_argument("--workers", required=True, help="Path to workers json file")
        p.add_argument("--timeout", type=int, default=300, help="HTTP timeout seconds")
        p.add_argument("--tavily-api-key", default="", help="Optional Tavily API key to enforce MCP registration")

    p_health = sub.add_parser("health", help="Check worker health")
    add_common_flags(p_health)

    p_broadcast = sub.add_parser("broadcast", help="Send same prompt to all workers")
    add_common_flags(p_broadcast)
    p_broadcast.add_argument("--prompt", required=True)

    p_chain = sub.add_parser("chain", help="Run sequential chain across workers")
    add_common_flags(p_chain)
    p_chain.add_argument("--prompt", required=True)

    return parser.parse_args()


def main() -> int:
    args = parse_args()
    workers = load_workers(Path(args.workers))
    if not workers:
        print("No workers found in workers file", file=sys.stderr)
        return 1

    tavily_api_key = args.tavily_api_key.strip() or None

    if args.command == "health":
        return health(workers, timeout=args.timeout)
    if args.command == "broadcast":
        return broadcast(workers, prompt=args.prompt, timeout=args.timeout, tavily_api_key=tavily_api_key)
    if args.command == "chain":
        return chain(workers, prompt=args.prompt, timeout=args.timeout, tavily_api_key=tavily_api_key)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
