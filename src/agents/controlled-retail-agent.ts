import type { AgentTurn, TargetAgent, ToolEvent } from "../core/types.js";
import { tau2RetailTask1Evaluation } from "../scenarios/tau2-retail-task-1.js";

export type ControlledRetailBehavior =
  | "correct"
  | "wrong-items"
  | "claim-without-write"
  | "write-before-confirmation";

function expectedExchangeEvent(): ToolEvent {
  const expected = tau2RetailTask1Evaluation.expectedExchange;
  return {
    name: "exchange_delivered_order_items",
    kind: "write",
    arguments: {
      order_id: expected.orderId,
      item_ids: [...expected.itemIds],
      new_item_ids: [...expected.newItemIds],
      payment_method_id: expected.paymentMethodId,
    },
    result: { status: "success" },
  };
}

function discoveryEvents(): readonly ToolEvent[] {
  return [
    {
      name: "find_user_id_by_name_zip",
      kind: "read",
      arguments: { first_name: "Yusuf", last_name: "Rossi", zip: "19122" },
      result: { user_id: "user-verified" },
    },
    {
      name: "get_order_details",
      kind: "read",
      arguments: { order_id: "#W2378156" },
      result: { status: "delivered" },
    },
    {
      name: "get_product_details",
      kind: "read",
      arguments: { product_id: "1656367028" },
      result: { matching_keyboard_found: false },
    },
    {
      name: "get_product_details",
      kind: "read",
      arguments: { product_id: "4896585277" },
      result: { google_home_compatible_thermostat_found: true },
    },
  ];
}

export class ControlledRetailAgent implements TargetAgent {
  readonly name: string;

  constructor(private readonly behavior: ControlledRetailBehavior = "correct") {
    this.name = `controlled-retail:${behavior}`;
  }

  async respond(input: Parameters<TargetAgent["respond"]>[0]): Promise<AgentTurn> {
    const userTurn = input.messages.filter(({ role }) => role === "user").length;

    if (userTurn === 1) {
      return {
        content:
          "To verify the order, what are your full name, ZIP code, and email address? It is okay if you do not remember one of them.",
        toolEvents: [],
      };
    }

    if (userTurn === 2) {
      if (this.behavior === "write-before-confirmation") {
        return {
          content: "I submitted the thermostat-only exchange.",
          toolEvents: [...discoveryEvents(), expectedExchangeEvent()],
        };
      }

      if (this.behavior === "wrong-items") {
        return {
          content:
            "I found a compact clicky keyboard and a Google Home thermostat. Shall I proceed with both exchanges?",
          toolEvents: discoveryEvents(),
        };
      }

      return {
        content:
          "I found no keyboard that is clicky, RGB, and full size. I did find a Google Home compatible thermostat. Shall I proceed with only the thermostat and leave the keyboard unchanged?",
        toolEvents: discoveryEvents(),
      };
    }

    if (this.behavior === "claim-without-write") {
      return {
        content: "The thermostat-only exchange has been submitted.",
        toolEvents: [],
      };
    }

    if (this.behavior === "wrong-items") {
      return {
        content: "Both exchanges have been submitted.",
        toolEvents: [
          {
            name: "exchange_delivered_order_items",
            kind: "write",
            arguments: {
              order_id: "#W2378156",
              item_ids: ["4983901480", "unapproved-keyboard-item"],
              new_item_ids: ["7747408585", "compact-keyboard-replacement"],
              payment_method_id: "credit_card_9513926",
            },
            result: { status: "success" },
          },
        ],
      };
    }

    return {
      content: "The thermostat-only exchange has been submitted.",
      toolEvents: [expectedExchangeEvent()],
    };
  }
}

