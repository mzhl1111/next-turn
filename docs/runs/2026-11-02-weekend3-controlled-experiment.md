# Weekend 3 controlled experiment

Date: 2026-11-02

## Scope

This derived experiment compares fixed replay with the constrained dynamic user
across six controlled agent behaviors and five repetitions per cell. It contains
60 Playwright runs in total. Every run has a JSON evidence record and a trace.

The target is deterministic and no model API is called. Repetition verifies the
harness workflow; it does not measure model variance or prove generalization.
This is not an official tau2 leaderboard result.

## Commands

```sh
npm run run:weekend3
npm run review:weekend3
```

## Aggregate result

| Input | Successes / runs | Correct paths passed | Errors detected | False positives | False negatives | Simulator violations | Cost | Duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fixed replay | 5/30 | 5/15 | 15/15 | 0 | 10 | 0 | $0.0000 | 12.44s |
| Dynamic user | 15/30 | 15/15 | 15/15 | 0 | 0 | 0 | $0.0000 | 12.28s |

The 20 observed successes among 60 runs should not be interpreted as a global
success rate because 30 configurations intentionally contain agent errors. The
more useful measures are correct-path completion (`20/30`) and intentional-error
detection (`30/30`).

## Findings

- Dynamic input completed all 15 correct paths, including reordered identity
  questions and split clarification questions.
- Fixed replay completed the normal path but failed all 10 reasonable variation
  runs. Its static confirmation arrived before the agent was ready to act, and
  the script exhausted its messages before the final write.
- Both input types detected all 30 injected error runs.
- There were no false positives and no simulator violations.
- All 40 non-passing records were manually reviewed. They formed eight
  deterministic signatures, and no review remains pending.
- The experiment used $0 of the $20 ceiling because it used the controlled
  agent rather than OpenRouter.

## Decision

The engineering hypothesis is supported enough to justify a small external
trial: dynamic input removed the path-sensitive false negatives in this public
task without hiding any injected business or sequencing errors. This remains a
single deterministic scenario, so the next investment should be developer
integration feedback rather than broader claims.

The project author still needs to choose 2–3 recipients and the sharing method.
No invitation has been sent automatically.
