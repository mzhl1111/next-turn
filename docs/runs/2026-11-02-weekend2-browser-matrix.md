# Weekend 2 browser matrix

Date: 2026-11-02

## Scope

This run validates the local chat page, the Playwright adapter, two reasonable
conversation variations, and three controlled execution failures for pinned
tau2 retail task `1`. The controlled agent is deterministic and no model API is
called.

The browser sees only the visible conversation. Tool events are collected from
the session record after the simulator stops, then passed to the independent
evaluator. The adapter waits for the exact `data-turn-id` whose
`data-turn-status` becomes `complete`; it does not use fixed delays to infer a
finished response.

## Command

```sh
npm run test:e2e
```

## Result

| Case | Expected outcome | Observed outcome | Evidence category |
| --- | --- | --- | --- |
| Normal control | Pass | Pass | None |
| Identity and preference questions reordered | Pass | Pass | None |
| Clarification questions split across turns | Pass | Pass | None |
| Unapproved keyboard included | Fail | Detected | Business and process |
| Success claimed without a write | Fail | Detected | Business and process |
| Write before explicit confirmation | Fail | Detected | Process |

All six cases produced a separate Playwright trace. The test also captured the
completed normal flow at desktop width and the split-question flow at a
390-by-844 mobile viewport.

## Local evidence

The ignored `artifacts/weekend2/` directory contains:

- `evidence/*.json`: visible messages, tool events, assertion outcomes, failure
  categories, stop reason, turn IDs, and trace path for each case;
- `traces/*.zip`: one Playwright trace per case;
- `screenshots/desktop.png` and `screenshots/mobile.png`: responsive visual QA;
- `summary.md`: the compact six-case result table.

Failure evidence keeps business, process, simulator, and harness categories
separate. Unit coverage verifies that a browser or turn-completion error is
reported as a harness issue rather than being misattributed to the target agent.
