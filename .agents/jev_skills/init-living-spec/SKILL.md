---
name: init-living-spec
description: Bootstrap docs/ directory tree with feature_spec, technical_spec, living_spec directories and README files. Delegates to living-spec-init subagent. Use when setting up living spec structure in a new or existing project.
triggers:
  - "init living spec"
  - "setup living spec"
  - "initialize docs"
  - "bootstrap docs"
  - "create docs structure"
---

# init-living-spec

Bootstrap the `docs/` directory tree for living spec workflow.

## Workflow

1. Dispatch `living-spec-init` subagent via Task tool
2. Report created directories and files to user

## When to init

- New project setup
- Migrating from CONTEXT.md to living spec docs
- Recovering from accidental doc deletion (missing directories only)

## Rules

- Always dispatch living-spec-init — never create docs structure manually
- Subagent only creates missing directories/files — never overwrites
- After init, populate `docs/feature_spec/` with actual spec content
