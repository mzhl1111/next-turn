"""Print a concise summary from a tau2 results file, including raw API cost."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any


def nested_number(value: Any, *keys: str) -> float:
    for key in keys:
        if not isinstance(value, dict):
            return 0
        value = value.get(key)
    return value if isinstance(value, (int, float)) else 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("results", type=Path)
    args = parser.parse_args()
    payload = json.loads(args.results.read_text())
    simulations = payload.get("simulations", [])
    if len(simulations) != 1:
        raise ValueError(f"expected one simulation, found {len(simulations)}")

    simulation = simulations[0]
    messages = simulation.get("messages", [])
    reward_info = simulation.get("reward_info") or {}
    db_check = reward_info.get("db_check") or {}
    action_checks = reward_info.get("action_checks") or []
    providers = Counter(
        provider
        for message in messages
        if (provider := (message.get("raw_data") or {}).get("provider"))
    )

    summary = {
        "task_id": simulation.get("task_id"),
        "reward": nested_number(simulation, "reward_info", "reward"),
        "db_match": db_check.get("db_match"),
        "termination_reason": simulation.get("termination_reason"),
        "duration_seconds": simulation.get("duration"),
        "message_count": len(messages),
        "model_calls": sum(message.get("usage") is not None for message in messages),
        "prompt_tokens": sum(
            nested_number(message, "usage", "prompt_tokens") for message in messages
        ),
        "completion_tokens": sum(
            nested_number(message, "usage", "completion_tokens")
            for message in messages
        ),
        "reasoning_tokens": sum(
            nested_number(
                message,
                "raw_data",
                "usage",
                "completion_tokens_details",
                "reasoning_tokens",
            )
            for message in messages
        ),
        "actual_openrouter_cost_usd": sum(
            nested_number(message, "raw_data", "usage", "cost")
            for message in messages
        ),
        "providers": dict(sorted(providers.items())),
        "actions": [
            {
                "name": check.get("action", {}).get("name"),
                "matched": check.get("action_match"),
                "type": check.get("tool_type"),
            }
            for check in action_checks
        ],
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
