# Upstream sources

The first public fixture is pinned so experiments do not silently change when
an upstream default branch changes.

## tau2-bench

- Repository: <https://github.com/sierra-research/tau2-bench>
- Release tag: `v1.0.1`
- Tag object: `b711c1ead46f55111bf765cf44d5da8bacc2d28c`
- Commit: `fc0055dc4e0a316c3f83133267fbd6faaa770992`
- License: MIT, Copyright 2025 Sierra Research
- Runtime constraint: Python `>=3.12,<3.14`

SHA-256 hashes at that commit:

| Upstream path | SHA-256 |
| --- | --- |
| `data/tau2/domains/retail/tasks.json` | `8e03ebce7901bd6218e7a7dc3105faa9324091a68058f7fe61c65262868812e8` |
| `data/tau2/domains/retail/policy.md` | `2c9652afbce57d6e087768d37cda64d31c53d50b3e3225cfdb791bac66466467` |
| `pyproject.toml` | `23d59670b4ad7bbc0f57420fd9643a8d9188c24abe4f29c9c965544d8cc4cb8d` |
| `LICENSE` | `e67c5aa0074dfcaefd3c3a1aedb94cb539234aecd15d5a972574e3200e6252fe` |

The MVP references the fixture metadata but does not vendor upstream source or
data. If upstream material is copied later, its MIT license and attribution
must accompany it.

