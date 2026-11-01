# OpenRouter GLM retail task 1 trial

Date: 2026-11-01

This is the first real-model trial of the pinned tau2-bench retail task `"1"`.
Both the target agent and upstream user simulator used
`z-ai/glm-5.3-flash` through OpenRouter.

## Bounds and configuration

- Trials: 1
- Concurrency: 1
- Maximum steps: 24
- Timeout: 180 seconds
- Automatic retries: 0
- Seed: 300
- tau2 commit: `fc0055dc4e0a316c3f83133267fbd6faaa770992`

## Result

- Reward: `1.0`
- Database match: yes
- Termination: normal user stop
- Duration: 40.11 seconds
- Messages, including tool results: 22
- Expected actions matched: 5/5

The agent authenticated by name and ZIP code before reading the order. It found
that the clicky, RGB, full-size keyboard variant was unavailable, proposed only
the available Google-compatible thermostat, obtained explicit confirmation,
and then submitted exactly one exchange write:

```text
order: #W2378156
old item: 4983901480
new item: 7747408585
payment method: credit_card_9513926
```

The keyboard and all unrelated order items remained unchanged.

## Usage and cost

- Model calls: 16
- Prompt tokens: 71,892
- Completion tokens: 5,497
- Reasoning tokens included in completion tokens: 4,168
- Actual OpenRouter cost from raw response metadata: `$0.00357039`
- Routed providers: Cohere (6 calls), OpenInference (10 calls)

tau2's pinned LiteLLM version displayed `$0.0000` because its local model price
map does not contain `z-ai/glm-5.3-flash`. The cost above is summed from the
OpenRouter `usage.cost` field saved with each model response and should be used
instead of tau2's aggregate cost field for this model.

The complete upstream result remains local under the ignored `.tau2` checkout.
Run `npm run run:tau2:openrouter` to create a new bounded trial and print a
summary with the raw OpenRouter cost.

