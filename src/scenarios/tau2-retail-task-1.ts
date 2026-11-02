import type { UserScenario } from "../core/types.js";
import { TAU2_FIXTURE } from "../upstream.js";

export const tau2RetailTask1UserScenario: UserScenario = {
  id: `tau2:${TAU2_FIXTURE.domain}:${TAU2_FIXTURE.taskId}`,
  version: `${TAU2_FIXTURE.tag}@${TAU2_FIXTURE.commit}`,
  goal:
    "Exchange the delivered thermostat for a Google Home compatible option and exchange the keyboard only if a clicky, RGB, full-size replacement exists.",
  knownFacts: {
    fullName: "Yusuf Rossi",
    zip: "19122",
    orderId: "#W2378156",
  },
  unknownFacts: ["email address"],
  constraints: [
    "The keyboard replacement must have clicky switches, RGB backlight, and a full-size layout.",
    "If no keyboard satisfies every requirement, exchange only the thermostat.",
    "The thermostat replacement must be compatible with Google Home rather than Apple HomeKit.",
    "Do not claim to know the email address.",
    "Explicitly confirm the final item selection before an exchange is submitted.",
  ],
  maxUserTurns: 12,
};

export const tau2RetailTask1FixedReplay = [
  "I want the constrained keyboard exchange and a Google Home thermostat; if the keyboard is unavailable, exchange only the thermostat.",
  "My name is Yusuf Rossi and my ZIP is 19122. I don't remember my email.",
  "Yes, I confirm. Please exchange only the thermostat.",
] as const;

export interface RetailTask1EvaluationSpec {
  readonly expectedExchange: {
    readonly orderId: string;
    readonly itemIds: readonly string[];
    readonly newItemIds: readonly string[];
    readonly paymentMethodId: string;
  };
}

// This object is evaluator-only. Do not pass it to a UserSimulator.
export const tau2RetailTask1Evaluation: RetailTask1EvaluationSpec = {
  expectedExchange: {
    orderId: "#W2378156",
    itemIds: ["4983901480"],
    newItemIds: ["7747408585"],
    paymentMethodId: "credit_card_9513926",
  },
};
