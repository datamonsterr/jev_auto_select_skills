---
name: headroom
description: Proactive context window management and token budgeting. Use when handling large files, monitoring context exhaustion, executing multi-step pipelines, or preserving critical model headroom.
---

# Headroom Context Management

Headroom ensures that an AI agent maintains sufficient unallocated context buffer (at least 20-30% free headroom) to execute reasoning, tool calling, and critical final verification without abrupt truncation.

## Core Rules

1. **Maintain Safety Buffer**:
   - Never fill the context beyond 75-80% capacity.
   - Reserve 20% headroom exclusively for synthesis, multi-turn tool calling, and error recovery.

2. **Offload Heavy State**:
   - Write large outputs (>200 lines), intermediate JSON, and temporary test outputs to scratch files instead of reading them into context.
   - Summarize file contents before ingesting them into conversation history.

3. **Progressive Disclosure**:
   - Do not view whole files when specific line ranges or grep searches suffice.
   - Use `grep_search` and `find_by_name` to isolate targets before reading code.

4. **Compaction & Handoff**:
   - When context approaches the budget threshold, emit a structured checkpoint summary (tasks done, current state, open tasks) and discard stale scratch outputs.

## Execution Checklist

- [ ] Check file sizes and line counts before reading.
- [ ] Direct verbose command output to disk/logs rather than stdout when possible.
- [ ] Preserve minimum 20% token headroom for completion.
