# next-turn

`next-turn` is an experimental dynamic-user test harness for conversational
agents. A scenario owns the user's facts and constraints, a simulator produces
the next user turn from visible history, and an independent evaluator decides
whether the task actually succeeded.

The first fixture is [tau2-bench](https://github.com/sierra-research/tau2-bench)
retail task `"1"` at release `v1.0.1`. See [PLAN.md](./PLAN.md) for the experiment
design and [docs/upstream-sources.md](./docs/upstream-sources.md) for the exact
upstream pin and file hashes.

## Current scope

Weekend 1 is in progress:

- pin and verify the public upstream fixture;
- model a scenario without exposing evaluator-only answers to the simulator;
- run fixed-replay and dynamic simulators against a controlled agent;
- record messages, tool events, assertions, and stop reasons.

The pinned upstream Python environment now passes a no-LLM validation of task
`"1"` tool semantics, final state, and database evaluator reward under Python
3.13. A real-model benchmark run has not been started.

## Development

Use Node.js 22, then install and check the project:

```sh
npm install
npm test
npm run typecheck
```

No paid model or API key is required for the controlled-agent tests.

### Pinned tau-bench environment

The upstream text runtime requires Python 3.12 or 3.13. With Homebrew's
Python 3.13 installed:

```sh
npm run setup:tau2
npm run validate:tau2
```

The requirement uses the exact upstream commit recorded in the source manifest
and intentionally omits voice extras. It also installs `audioop-lts` on Python
3.13 because tau2 v1.0.1 imports `audioop` during text-mode startup even though
that module was removed from Python's standard library in 3.13.

Setup creates an ignored `.venv`, checks out the pinned public benchmark under
the ignored `.tau2` directory, and verifies the source hashes. Validation then
replays the task's expected public tool actions and checks the resulting state
with the upstream environment evaluator. It does not call an LLM or use an API
key.
