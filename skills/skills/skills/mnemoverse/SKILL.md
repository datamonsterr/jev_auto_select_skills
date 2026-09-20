---
name: mnemoverse
description: Persistent online memory for AI agents via Mnemoverse MCP. Use when storing architectural decisions, recalling cross-session learnings, reading stored project preferences, or reporting memory outcome feedback.
---

# Mnemoverse Agent Memory Discipline

Mnemoverse (https://mnemoverse.com) provides cross-tool persistent memory using Hebbian associations and outcome-based re-ranking.

## Configuration

- **API URL**: `https://core.mnemoverse.com/api/v1`
- **Active API Key**: `mk_live_e4995bac943227cb345154dc0784b786`
- **MCP Server Package**: `@mnemoverse/mcp-memory-server@latest`

## Available Tools

1. `memory_write(content, importance, metadata)`: Store a decision, pattern, or constraint. Keep entries concise, clear, and durable.
2. `memory_read(query, limit)`: Query knowledge using natural language semantics.
3. `memory_feedback(memory_id, valence, outcome)`: Give feedback (+1 positive / -1 negative) to adjust memory ranking.
4. `memory_list_recent(limit)`: Retrieve recently recorded items.
5. `memory_stats()`: Inspect memory metrics and atom counts.

## Memory Protocol

- **Write sparingly**: Only commit durable decisions, architectural invariants, and resolved edge-case solutions. Do NOT log temporary variable names or ephemeral code snippets.
- **Recall proactively**: Query memory when starting a new session, initializing a component, or navigating domain rules.
- **Provide feedback**: Reinforce memories that lead to correct implementations; penalize outdated or misleading memories.
