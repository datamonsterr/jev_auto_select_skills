# caveman

Talk like smart caveman. Same brain, fewer tokens.

## What it does

Compress model responses to caveman-style prose by dropping articles, filler,
pleasantries, and hedging. Instruction preserves technical detail, code blocks,
error strings, and symbols. Result depends on model and workload; no aggregate
reduction or quality-equivalence claim is published, and mode persists until
changed or stopped.

Six intensity levels:

| Level | What change |
|-------|-------------|
| `lite` | Drop filler/hedging. Sentences stay full. Professional but tight. |
| `full` | Default. Drop articles, fragments OK, short synonyms. |
| `ultra` | Bare fragments. Abbreviations (DB, auth, fn). Arrows for causality. |
| `wenyan-lite` | Classical Chinese register, light compression. |
| `wenyan-full` | Maximum 文言文 compression. |
| `wenyan-ultra` | Extreme classical compression. |

Auto-clarity rule: caveman drops to normal prose for security warnings, irreversible-action confirmations, multi-step sequences where fragment ambiguity risks misread, and when user repeats a question. Resumes after the clear part.

## How to invoke

```
/caveman              # full mode (default)
/caveman lite         # lighter compression
/caveman ultra        # extreme compression
/caveman wenyan       # classical Chinese
stop caveman          # back to normal prose
```

## Example output

Question: "Why does my React component re-render?"

Normal prose:
> Your component re-renders because you create a new object reference each render. Wrapping it in `useMemo` will fix the issue.

Caveman (full):
> New object ref each render. Inline object prop = new ref = re-render. Wrap in `useMemo`.

Caveman (ultra):
> Inline obj prop → new ref → re-render. `useMemo`.

## See also

- [`SKILL.md`](./SKILL.md): full LLM-facing instructions
- [Caveman README](../../README.md): repo overview, install, benchmarks

## Project Development Guidance (Caveman Register)

Quick reference for developing P-063 in caveman mode:

- **Setup env**: `mise run init-project` (auto-checks git, python, uv, rtk, hooks).
- **Run dev server**: `mise run run` -> port 8000.
- **Test suite**: `mise run test` -> pytest with rtk compression.
- **Lint**: `mise run lint` -> ruff check.
- **Type check**: `mise run typecheck` -> mypy.
- **Pre-commit check**: `mise run check` -> runs lint, format check, mypy, pytest.
- **Sync harnesses**: `mise run sync` -> syncs Antigravity, OpenCode, Claude, Codex.
- **Add nodes**: `src/agents/nodes/` -> wire in `src/agents/graph.py`.
- **Add tools**: `@tool` in `src/agents/tools/`.
- **Docs update**: read `docs/<subfolder>/README.md` first -> write uppercase deliverables.

