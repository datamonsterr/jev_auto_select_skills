# 0003: Test layers and golden dataset

Status: accepted

## Context

Routing quality depends on a real model, but most tests must run offline, fast and without secrets.

## Decision

`tests/unit` (and legacy root tests) never use the network. `tests/integration` calls real OpenRouter and `tests/e2e` runs the 100-case `golden_set/e2e_golden.json` through `find --json` against `tests/fixtures/e2e-bank/`; both skip without `OPENROUTER_API_KEY`. E2E reports precision, recall and hit@k and asserts hit-rate >= 0.6 (`E2E_MIN_HIT`, `E2E_LIMIT` tune it). Cases adapt public benchmarks (MetaTool, ToolBench style) or are `synthetic`, with a `source` field.

## Consequences

`bun run test` is deterministic. Live results can vary with the free model, so the floor is loose and tunable. The fixture bank must change together with the dataset.
