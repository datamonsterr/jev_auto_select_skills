# 0004: CI and local git hooks

Status: accepted

## Context

Need fast feedback locally and a real-model quality gate without leaking the key to forks.

## Decision

GitHub Actions `ci.yml`: `check` job (Biome format and lint, `tsc`, `bun audit`, unit tests) on push and PR; `live` job (integration + e2e) on master pushes and manual dispatch, skipped for fork PRs, using secret `OPENROUTER_API_KEY`. Local hooks in `.githooks`, enabled by `bun run prepare` (`core.hooksPath`): pre-commit runs `check`; pre-push runs `audit` and unit tests.

## Consequences

PRs from forks get no live signal. Free-tier rate limits can make `live` flaky, so it does not gate PRs. Plain `.githooks` avoids an extra dependency but needs `prepare` to run once (done by `bun install`).
