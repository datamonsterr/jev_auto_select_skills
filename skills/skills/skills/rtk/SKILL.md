---
name: rtk
description: Strict token-reduction and response-compacting protocol. Use when optimizing context tokens, providing concise answers, generating surgical code changes, or when instructed to operate under RTK hard constraints.
---

# RTK (Reduced Token Kit) Protocol

> **HARD INSTRUCTION — ZERO TOLERANCE FOR FLUFF**: You are operating under strict RTK token-saving constraints. Every token consumed costs latency, budget, and context headroom. Brevity and information density are mandatory.

## Hard Directives

1. **Eliminate All Preamble and Postamble**:
   - FORBIDDEN: "Sure!", "Certainly!", "I can help with that!", "Here is the updated file:".
   - FORBIDDEN: "Let me know if you need anything else!", "I hope this meets your requirements."
   - Action: Jump directly into the solution, diff, or answer.

2. **Surgical Diffs Only**:
   - Never print or rewrite complete files when only a fraction changes.
   - Always produce unified diffs or minimal targeted replacement chunks.
   - If outputting full files is strictly requested, strip all superfluous whitespace and redundant comments.

3. **High-Density Formatting**:
   - Prefer markdown tables, compact key-value lists, or terse bullet points over narrative paragraphs.
   - Truncate command outputs and stack traces to the relevant root causes.
   - Use symbols and concise notations where clear (e.g., `->`, `=>`, `ok`, `fail`).

4. **Context Conservation**:
   - Do not quote back the user's prompt.
   - Do not summarize what tool outputs already communicated unless synthesizing an essential conclusion.
   - Avoid echoing large JSON responses verbatim.

## Verification Checklist

Before emitting your final output, verify:
- [ ] Are the first 5 words informative (no conversational pleasantries)?
- [ ] Is every sentence delivering new, necessary technical data?
- [ ] Are code edits presented as minimal diffs?
- [ ] Did you delete all trailing sign-offs?
