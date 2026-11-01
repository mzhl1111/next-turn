"""Validate tau2 retail task 1 tool semantics without making LLM calls."""

from __future__ import annotations

import json
import sys
from typing import Any

from loguru import logger

logger.remove()
logger.add(sys.stderr, level="WARNING")

from tau2.data_model.message import AssistantMessage, ToolCall
from tau2.domains.retail.environment import get_environment, get_tasks
from tau2.evaluator.evaluator_env import EnvironmentEvaluator


def main() -> None:
    task = next(task for task in get_tasks(task_split_name=None) if task.id == "1")
    if task.evaluation_criteria is None or task.evaluation_criteria.actions is None:
        raise RuntimeError("retail task 1 has no expected actions")

    environment = get_environment()
    trajectory = []
    observed_actions: list[dict[str, Any]] = []

    for index, action in enumerate(task.evaluation_criteria.actions, start=1):
        call = ToolCall(
            id=f"validation-{index}",
            name=action.name,
            arguments=action.arguments,
            requestor=action.requestor,
        )
        request = AssistantMessage(role="assistant", tool_calls=[call])
        response = environment.get_response(call)
        trajectory.extend([request, response])
        observed_actions.append(
            {
                "name": action.name,
                "arguments": action.arguments,
            }
        )

    reward = EnvironmentEvaluator.calculate_reward(
        environment_constructor=get_environment,
        task=task,
        full_trajectory=trajectory,
    )
    order = environment.tools.get_order_details("#W2378156")

    checks = {
        "task_id": task.id,
        "action_count": len(observed_actions),
        "db_reward": reward.db_check.db_reward if reward.db_check else None,
        "db_match": reward.db_check.db_match if reward.db_check else None,
        "order_status": order.status,
        "exchange_items": order.exchange_items,
        "exchange_new_items": order.exchange_new_items,
        "exchange_payment_method_id": order.exchange_payment_method_id,
    }

    expected = {
        "task_id": "1",
        "action_count": 5,
        "db_reward": 1.0,
        "db_match": True,
        "order_status": "exchange requested",
        "exchange_items": ["4983901480"],
        "exchange_new_items": ["7747408585"],
        "exchange_payment_method_id": "credit_card_9513926",
    }
    if checks != expected:
        raise AssertionError(
            "tau2 retail task 1 validation failed:\n"
            + json.dumps({"expected": expected, "observed": checks}, indent=2)
        )

    print(
        json.dumps(
            {
                "status": "passed",
                "checks": checks,
                "actions": observed_actions,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
