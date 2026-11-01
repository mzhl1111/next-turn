# Dynamic User Testing: Side Project MVP Plan

Date: 2026-11-01. Status: topic selection and planning complete; implementation and experiments have not yet started.

## Goals and boundaries

Build a dynamic user-testing component that integrates with Playwright: developers declare a user goal and constraints, the component generates the next input based on the actual response, and independent assertions ultimately determine whether the task was completed.

Use only public benchmarks plus demo and test code written from scratch. Company golden probes, code, prompts, logs, internal business rules, and accounts must not be used as inputs. Keep the project in a separate directory so it can later become a personal repository.

Core hypothesis: compared with fixed multi-turn inputs, a constrained dynamic user can adapt to reasonable changes in the conversation path while still exposing genuine business errors and providing enough evidence for developers to diagnose them.

tau-bench already includes dynamic user simulation. This project therefore does not attempt to prove that “an LLM can play a user.” It tests whether “scenario constraints + Playwright integration + independent assertions + failure evidence” can form a useful small tool.

## First task: tau-bench retail task 1

- Repository: <https://github.com/sierra-research/tau2-bench>
- Pinned version: `v1.0.1`, domain=`retail`, task ID=`"1"`. Record the tag's commit SHA and data hashes during implementation; do not automatically follow `main`.
- Task source: [tasks.json](https://github.com/sierra-research/tau2-bench/blob/v1.0.1/data/tau2/domains/retail/tasks.json)
- Business rules: [policy.md](https://github.com/sierra-research/tau2-bench/blob/v1.0.1/data/tau2/domains/retail/policy.md)
- License: [MIT, Copyright 2025 Sierra Research](https://github.com/sierra-research/tau2-bench/blob/v1.0.1/LICENSE). Preserve the original license and source attribution when importing upstream code or data.
- Runtime dependencies: this version requires Python >=3.12,<3.14. Initially install only the dependencies required for text-based execution, without voice extras. [Dependency declaration](https://github.com/sierra-research/tau2-bench/blob/v1.0.1/pyproject.toml)

Original task summary: the user wants to exchange a keyboard and a thermostat. The keyboard must satisfy specified switch, backlight, and size requirements; if no matching keyboard exists, only the thermostat should be exchanged. The user remembers their name and ZIP code but not their email address. The original task expects only a thermostat exchange to be initiated.

Why this task was chosen: it combines follow-up identity questions, conditional preferences, and partial completion; it has a clear final state and does not require a real third-party service. Keep the user's goal stable in the first version rather than adding complicated mid-conversation changes of mind.

Here, “completion” means the simulated system correctly records the exchange request, not that the replacement product has actually arrived. Acceptance follows the actual semantics of the tools and evaluator in this pinned version.

## Experiment design

First run the original task successfully in the upstream environment to confirm the database, tools, and evaluator behavior. Keep the upstream simulator as a reference. Label results from the custom policy and UI wrapper as derived experiments, and do not claim they are directly comparable with the official leaderboard.

Two primary test inputs:

1. Fixed replay: extract the sequence of user inputs from one successful conversation in the public demo, then replay them turn by turn.
2. Dynamic user: preserve the same goal and facts while generating input from the currently visible conversation.

All experiments use the same initial database, business rules, success assertions, and target-agent configuration, and the environment is reset before every run. Preserve variants that fixed replay can also handle; do not deliberately select scripts merely to manufacture an advantage.

Derived test matrix:

| Type | Agent behavior | Expected result |
| --- | --- | --- |
| Normal control | Perform ordinary clarification and complete the task | Both input types should pass |
| Reasonable variation A | Change the order of identity and preference questions while still following authentication rules | The dynamic user should answer correctly and the business task should pass |
| Reasonable variation B | Split or combine clarification questions | The dynamic user should remain consistent and the business task should pass |
| Error A | Add a keyboard that does not satisfy the constraints to the exchange | The user should reject it; if it is actually submitted, the business assertion should fail |
| Error B | Claim the request was submitted without writing any state | The result assertion should fail |
| Error C | Perform a write before receiving explicit confirmation | The sequencing assertion should fail even if the final state appears correct |

First use a controllable agent substitute to validate the test component itself, then run the same task with a real LLM agent. Artificially injected errors demonstrate detection capability only; they must not be described as newly discovered bugs in a real model.

## MVP structure

Use TypeScript + Playwright for the component and browser layers, while retaining the upstream Python environment and tools to avoid reimplementing business rules. The first version provides a minimal local chat page connected to the same target agent; it does not require a complete e-commerce UI.

```text
Scenario -> User simulator -> Playwright adapter -> Chat UI -> Target agent
                  ^                              |          |
                  +---- user-visible chat/UI ----+          v
                                                    tau environment tools
                                                            |
                                                            v
                         Independent evaluator <- event log + final state
```

Minimum modules:

- `scenario`: source, goal, user-known and user-unknown information, preferences, disclosure and confirmation rules, and turn limits.
- `simulator`: takes visible history and private user state, then returns the next message or stops; records decision rationales for debugging without sending them to the target agent.
- `adapter`: sends messages, waits for a complete response by turn ID, and reads user-visible content; does not use fixed sleeps to decide that a turn is complete.
- `evaluator`: checks business outcomes and critical sequencing. The user generator does not also act as the final judge.
- `reporter`: emits a JSON run record and Markdown summary that connect the Playwright trace, failed assertions, and relevant conversation.

Initially implement a thin alternating-call loop rather than binding the project to a large evaluation platform. Reassess OpenEvals later based on integration needs; do not rebuild a general-purpose model-calling library.

## Simulator information boundaries and reliability

The simulator can see the user scenario, conversation, and user-visible UI. It cannot see hidden target answers, expected product IDs, the full database contents, agent-internal reasoning, or evaluator results.

Split upstream user information from scoring information during loading; do not put the complete task JSON directly into the simulator prompt. Keep identity and preferences in fixed state while allowing their linguistic expression to vary. When information is unknown, the simulator must acknowledge that it does not know rather than inventing an email address or relaxing constraints on its own.

The first version combines rule-based constraints with LLM expression: rules maintain facts, preferences, and the scope of confirmation, while the model interprets responses and generates natural language. Retry structured-output validation failures a limited number of times. If validation still fails, record a simulator error rather than blaming the agent.

Stop conditions: the user ends the conversation, a turn limit is reached, a time limit is reached, a cost limit is reached, or an execution error occurs. A user saying “done” only triggers a stop; it does not automatically mean the run passed. Default to at most 12 user turns, with additional limits on tool calls and per-turn duration.

## Scoring and diagnosis

Record three result categories separately and preserve evidence for multiple failures rather than forcing them into a single cause:

1. Business: reuse the upstream evaluator and add checks that unauthorized products were not changed and that no duplicate writes occurred.
2. Process: authentication must precede protected queries, and explicit confirmation must precede writes. Prefer verification from tool logs and controlled-substitute events; flag uncertain natural-language confirmation detection separately for human review.
3. Simulator / harness: determine whether the user violated established preferences, leaked hidden information, or confirmed without justification, and whether the browser timed out or failed to read a response.

Record the scenario/version, model version, prompt hash, parameters, initial-state hash, all visible messages, tool events, assertions, token usage, duration, and cost. A fixed seed does not imply deterministic reproduction.

Distinguish two meanings of “reproduction”: trajectory replay shows what happened at the time, while re-execution tests whether the issue occurs again. Saving static inputs helps investigation but does not guarantee that a new agent path remains compatible with the old inputs.

## Three-weekend milestones

### Weekend 1: close the loop on the public task

- [ ] Create an independent project and source manifest, and pin the upstream version and hashes.
- [ ] Run the original task and verify tool-write semantics and evaluator results.
- [ ] Establish isolated sessions, environment reset, and message and tool-event recording.
- [ ] Implement the API loop for both a fixed-input baseline and a dynamic user.
- Deliverable: two inspectable trajectories for the same public task with assertions against real state.

### Weekend 2: Playwright integration and error detection

- [ ] Build a local chat page and Playwright adapter.
- [ ] Add two reasonable conversation variations and three controllable errors.
- [ ] Output failure evidence and a Playwright trace while distinguishing business, simulator, and harness issues.
- Deliverable: a demo in which a correct agent can change question order and still pass, while incorrect execution is still caught by assertions.

### Weekend 3: repeated experiments and external trial

- [ ] Run each of two input types five times under six configurations, for 60 small-sample experiments in total.
- [ ] Report successes/total runs, false positives, false negatives, simulator violations, cost, and duration; do not interpret the small sample as proof of generalization.
- [ ] Manually review every failure and simulator-violation record.
- [ ] Write an integration example and invite 2–3 developers to try the public demo; the project author decides whether and how to send invitations.
- Deliverable: a short experiment report and a decision on whether to continue investing in the project.

## Budget and continuation criteria

Estimate per-run cost before enabling real-model experiments. Set a suggested hard limit of US$20 for the complete experiment cycle; this is a budget target, not a cost quotation. Stop at the limit and report unfinished items. Read API keys only from the local environment and never commit them.

MVP engineering acceptance: the controllable correct substitute passes both reasonable variations; all three error types trigger the expected assertions; failed trajectories provide enough evidence to explain the cause; and no hidden answers are provided to the simulator.

Signals for further investment: dynamic input reduces false positives caused by path variation compared with fixed replay without hiding business errors; at least two external trial users can integrate it and find the diagnostic output useful. If the simulator frequently departs from its rules or most of the work involves explaining false positives, improve constraints and observability first.

The first version will not include SaaS, an account system, a dashboard, voice, multiple benchmark domains, modeling of real human behavior, or training. The first task can demonstrate only an engineering loop; demonstrating generality requires additional independent scenarios later.

## Starting point for the next work session

Begin with the Weekend 1 import of the pinned public version and execution of the original task. No upstream data has been copied, no dependencies have been installed, no paid model has been called, and none of the components above have been implemented yet.
