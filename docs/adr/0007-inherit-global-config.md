# 0007: Inherited global config

Status: accepted

## Context

A project config replaced the global one entirely, so a project with its own bank lost every globally installed category and skill.

## Decision

- Schema field `inheritGlobal` (default true). When the loaded file is not the global file, the scope is not `global` and the global file exists, `loadConfig` attaches the global categories, enabled categories and bank as a non-schema `inherited` field. This includes an explicit `--config` pointing at a project file.
- `routingView(config)` returns the merged categories (project first, project description wins on collision), the enabled union (a `--categories` override is final) and the banks to scan. It throws when the union exceeds `limits.maxCandidates`.
- `discoverBank` scans every bank with the same checks, keeping the first (project) copy of a duplicate instance or logical ID per category.
- `configData` strips `inherited`, so nothing global is written to a project file. Writes (`add`, `create`, `classify`) target only the project bank.

## Consequences

No source has priority in routing prompts. A malformed global config now breaks project runs. Menu and `config set categories` still edit project categories only.
