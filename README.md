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

The upstream Python environment has not yet been executed. tau2-bench `v1.0.1`
requires Python `>=3.12,<3.14`; Python 3.14 is not compatible.

## Development

Use Node.js 22, then install and check the project:

```sh
npm install
npm test
npm run typecheck
```

No paid model or API key is required for the controlled-agent tests.

