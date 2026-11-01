# Weekend 1 controlled trajectory validation

Date: 2026-11-01

## Scope

This validation closes the remaining Weekend 1 requirement for isolated
sessions, environment reset, and inspectable fixed and dynamic trajectories.
It uses the controlled correct agent and the pinned tau2-bench retail task `1`.
No model API is called.

## Command

```sh
npm run run:weekend1
```

## Result

| Input type | Visible messages | Real tool events | DB reward | Final order status |
| --- | ---: | ---: | ---: | --- |
| Fixed replay | 6 | 5 | 1.0 | exchange requested |
| Dynamic user | 6 | 5 | 1.0 | exchange requested |

Both environment instances began with order `#W2378156` in `delivered` state.
Their full initial database SHA-256 hashes were identical:

`3ca5bd70e621602e23d909c87f26224a1a486e75955d8a6da53721ec224b23dc`

Each session then changed only its own environment instance to the expected
thermostat-only exchange. The upstream database evaluator reported a matching
target state and reward `1.0` for both runs.

## Evidence

The ignored `artifacts/weekend1/` directory contains:

- `fixed.json`: visible fixed-replay messages, simulator decisions, harness
  assertions, real tool responses, and real final state;
- `dynamic.json`: the equivalent dynamic-user trajectory;
- `trajectories.json`: both records plus the isolation checks;
- `summary.md`: a compact local summary.

The artifact records exclude model reasoning and API secrets. Tool responses
come from the public synthetic tau2 fixture and are retained only for local
diagnosis.
