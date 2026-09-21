---
name: update-living-spec
description: Sync docs/feature_spec/ to docs/living_spec/ after feature changes. Delegates to spec-syncer subagent. Use after proposal acceptance, implementation completion, or any product behavior change.
triggers:
  - "update living spec"
  - "sync specs"
  - "sync living spec"
  - "sync feature specs"
---

# update-living-spec

Sync `docs/feature_spec/` → `docs/living_spec/` after feature changes.

## Workflow

1. Dispatch `spec-syncer` subagent via Task tool
2. Report sync results to user: files synced, skipped, errors

## When to sync

- After accepting a proposal that changes product behavior
- After implementing a feature that changes specs
- After updating domain model in `docs/feature_spec/00-domain-model.md`
- After adding/removing/renaming feature spec files

## Rules

- Always dispatch spec-syncer — never attempt to sync manually
- Report results verbatim from subagent output
- If sync fails, report errors and suggest manual review
