---
name: read-living-spec
description: Read docs/living_spec/ files for implementation context. Delegates to spec-puller subagent. Use before starting any implementation task to ensure you have current specs.
triggers:
  - "read living spec"
  - "pull specs"
  - "get specs"
  - "load specs"
  - "read specs"
---

# read-living-spec

Pull `docs/living_spec/` content for implementation context.

## Workflow

1. Dispatch `spec-puller` subagent via Task tool
2. Load returned content into current session context

## When to read

- Before starting any implementation task
- When context seems stale or you need to verify current behavior
- After a spec-sync to refresh knowledge

## Rules

- Always use spec-puller subagent — never read living_spec files directly
- Pull specific files when you know what you need (e.g., "00-domain-model.md, 04-chat-interface.md")
- Pull all when starting fresh or unsure
