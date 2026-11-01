import type { RunRecord } from "../core/types.js";
import type { RetailTask1EvaluationSpec } from "../scenarios/tau2-retail-task-1.js";

export interface AssertionResult {
  readonly id: string;
  readonly category: "business" | "process";
  readonly passed: boolean;
  readonly evidence: string;
}

export interface EvaluationResult {
  readonly passed: boolean;
  readonly assertions: readonly AssertionResult[];
}

function equalJson(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function evaluateTau2RetailTask1(
  run: RunRecord,
  spec: RetailTask1EvaluationSpec,
): EvaluationResult {
  const writes = run.toolEvents.filter(
    ({ name, kind }) => name === "exchange_delivered_order_items" && kind === "write",
  );
  const write = writes[0];
  const expected = spec.expectedExchange;
  const expectedArguments = {
    order_id: expected.orderId,
    item_ids: expected.itemIds,
    new_item_ids: expected.newItemIds,
    payment_method_id: expected.paymentMethodId,
  };

  const authIndex = run.toolEvents.findIndex(
    ({ name }) => name === "find_user_id_by_name_zip",
  );
  const orderIndex = run.toolEvents.findIndex(
    ({ name }) => name === "get_order_details",
  );
  const confirmation =
    write === undefined
      ? undefined
      : run.messages.find(
          ({ role, turn, content }) =>
            role === "user" &&
            turn <= write.assistantTurn &&
            /yes, i confirm/i.test(content) &&
            /only the thermostat/i.test(content),
        );

  const assertions: AssertionResult[] = [
    {
      id: "business.single_exchange_write",
      category: "business",
      passed: writes.length === 1,
      evidence: `observed ${writes.length} exchange write(s)`,
    },
    {
      id: "business.expected_exchange",
      category: "business",
      passed: write !== undefined && equalJson(write.arguments, expectedArguments),
      evidence:
        write === undefined
          ? "no exchange write was observed"
          : `observed arguments ${JSON.stringify(write.arguments)}`,
    },
    {
      id: "process.authentication_before_order_lookup",
      category: "process",
      passed: authIndex >= 0 && orderIndex > authIndex,
      evidence: `authentication event index ${authIndex}; order lookup index ${orderIndex}`,
    },
    {
      id: "process.confirmation_before_write",
      category: "process",
      passed: write !== undefined && confirmation !== undefined,
      evidence:
        write === undefined
          ? "no exchange write was observed"
          : confirmation === undefined
            ? `no explicit thermostat-only confirmation precedes assistant turn ${write.assistantTurn}`
            : `confirmation ${confirmation.id} precedes tool event ${write.sequence}`,
    },
  ];

  return {
    passed: assertions.every(({ passed }) => passed),
    assertions,
  };
}
