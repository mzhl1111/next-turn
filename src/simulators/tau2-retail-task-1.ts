import type {
  SimulatorDecision,
  SimulatorInput,
  UserSimulator,
  VisibleMessage,
} from "../core/types.js";

function latestAssistantMessage(
  messages: readonly VisibleMessage[],
): VisibleMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") return message;
  }
  return undefined;
}

function includesAny(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => value.includes(term));
}

export class Tau2RetailTask1Simulator implements UserSimulator {
  readonly name = "dynamic:tau2-retail-task-1";

  async next(input: SimulatorInput): Promise<SimulatorDecision> {
    if (input.messages.length === 0) {
      return {
        kind: "message",
        content:
          "I received order #W2378156 and want to exchange the mechanical keyboard for the same one with clicky switches, RGB backlight, and a full-size layout. I also want to exchange the smart thermostat for one compatible with Google Home instead of Apple HomeKit. If no keyboard meets all three requirements, please exchange only the thermostat.",
        rationale: "state the stable goal and all product constraints",
      };
    }

    const latest = latestAssistantMessage(input.messages);
    if (latest === undefined) {
      return {
        kind: "stop",
        reason: "cannot_continue",
        rationale: "no assistant response is visible",
      };
    }

    const text = latest.content.toLowerCase();
    if (includesAny(text, ["submitted", "exchange is complete", "exchange has been"])) {
      return {
        kind: "stop",
        reason: "completed",
        rationale:
          "the agent claims the request was submitted; independent evaluation must verify it",
      };
    }

    const asksToProceed = includesAny(text, [
      "confirm",
      "proceed",
      "go ahead",
      "submit",
    ]);
    const mentionsKeyboard = text.includes("keyboard");
    const saysKeyboardUnavailable = includesAny(text, [
      "no keyboard",
      "keyboard does not",
      "keyboard isn't",
      "keyboard is not",
      "only the thermostat",
    ]);

    if (asksToProceed && mentionsKeyboard && !saysKeyboardUnavailable) {
      return {
        kind: "message",
        content:
          "Please do not exchange the keyboard unless the replacement is clicky, RGB, and full size. If it does not meet every requirement, exchange only the thermostat for the Google Home compatible option.",
        rationale: "reject a proposed keyboard exchange that has not met every constraint",
      };
    }

    if (asksToProceed) {
      return {
        kind: "message",
        content:
          "Yes, I confirm. Please exchange only the thermostat for the Google Home compatible option and leave the keyboard unchanged.",
        rationale: "explicitly confirm the permitted thermostat-only write",
      };
    }

    const answers: string[] = [];
    if (includesAny(text, ["name", "identity", "who are you"])) {
      answers.push("My name is Yusuf Rossi.");
    }
    if (includesAny(text, ["zip", "postal"])) {
      answers.push("My ZIP code is 19122.");
    }
    if (text.includes("email")) {
      answers.push("I don't remember my email address.");
    }
    if (includesAny(text, ["order number", "order id"])) {
      answers.push("The order number is #W2378156.");
    }
    if (includesAny(text, ["keyboard", "switch", "backlight", "layout"])) {
      answers.push(
        "The keyboard must be clicky, have RGB backlight, and be full size; otherwise leave it unchanged.",
      );
    }
    if (includesAny(text, ["thermostat", "google home", "homekit"])) {
      answers.push(
        "The thermostat replacement must support Google Home rather than Apple HomeKit.",
      );
    }

    if (answers.length > 0) {
      return {
        kind: "message",
        content: answers.join(" "),
        rationale: "answer only the visible questions using scenario-owned facts",
      };
    }

    return {
      kind: "message",
      content:
        "What information do you need from me to handle that exchange without changing my requirements?",
      rationale: "request clarification instead of inventing an unknown fact",
    };
  }
}
