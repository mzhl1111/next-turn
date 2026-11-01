"""Replay harness tool events against fresh tau2 retail environments."""

from __future__ import annotations

import hashlib
import json
import sys
from typing import Any

from loguru import logger

logger.remove()
logger.add(sys.stderr, level="WARNING")

from tau2.data_model.message import AssistantMessage, ToolCall
from tau2.domains.retail.environment import get_environment, get_tasks
from tau2.evaluator.evaluator_env import EnvironmentEvaluator


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def database_snapshot(environment: Any) -> dict[str, Any]:
    return environment.tools.db.model_dump(mode="json")


def order_snapshot(environment: Any) -> dict[str, Any]:
    return environment.tools.get_order_details("#W2378156").model_dump(mode="json")


def replay_run(run_input: dict[str, Any], task: Any) -> dict[str, Any]:
    environment = get_environment()
    initial_database = database_snapshot(environment)
    initial_order = order_snapshot(environment)
    trajectory = []
    tool_events = []

    for index, event in enumerate(run_input["run"]["toolEvents"], start=1):
        call = ToolCall(
            id=f"{run_input['sessionId']}-tool-{index}",
            name=event["name"],
            arguments=event["arguments"],
            requestor="assistant",
        )
        request = AssistantMessage(role="assistant", tool_calls=[call])
        response = environment.get_response(call)
        trajectory.extend([request, response])
        tool_events.append(
            {
                "sequence": index,
                "assistantTurn": event["assistantTurn"],
                "name": event["name"],
                "kind": event["kind"],
                "arguments": event["arguments"],
                "result": response.model_dump(mode="json"),
            }
        )

    reward = EnvironmentEvaluator.calculate_reward(
        environment_constructor=get_environment,
        task=task,
        full_trajectory=trajectory,
    )
    final_database = database_snapshot(environment)
    final_order = order_snapshot(environment)

    return {
        "sessionId": run_input["sessionId"],
        "initialStateHash": canonical_hash(initial_database),
        "finalStateHash": canonical_hash(final_database),
        "initialOrder": initial_order,
        "finalOrder": final_order,
        "toolEvents": tool_events,
        "environmentEvaluation": {
            "reward": reward.reward,
            "dbReward": reward.db_check.db_reward if reward.db_check else None,
            "dbMatch": reward.db_check.db_match if reward.db_check else None,
        },
    }


def main() -> None:
    request = json.load(sys.stdin)
    runs = request.get("runs")
    if not isinstance(runs, list) or len(runs) != 2:
        raise ValueError("expected exactly two run records")

    task = next(task for task in get_tasks(task_split_name=None) if task.id == "1")
    output = {"replays": [replay_run(run, task) for run in runs]}
    json.dump(output, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
