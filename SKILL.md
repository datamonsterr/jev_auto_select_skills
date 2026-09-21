---
name: jev-skill-selector
description: Fast, calibrated multi-skill router using TypeSafe Jev decision model on OpenRouter (~typesafe/jev-latest). Dynamically filters and injects only relevant skills from your skills bank per prompt to eliminate context bloat. Use on every prompt or before agent task execution.
---

# Jev Skill Selector

High-speed, calibrated multi-skill router powered by the **TypeSafe Jev System One** decision model on OpenRouter (`~typesafe/jev-latest`).

Instead of polluting the agent's context window by loading 70+ skills on startup, Jev evaluates the user prompt against your centralized skill bank in a single parallel tensor pass (~400–700ms) and returns only the necessary skills for that specific task.

## Quick Start

Run skill selection from the CLI:

```bash
bun run index.ts "Refactor the payment gateway with TDD and make a git commit"
```

Output:
```text
🎯 Jev Skill Selection Result
Prompt: "Refactor the payment gateway with TDD and make a git commit"
Primary Choice: tdd
Confidence: 0.88

Selected Skills:
  • tdd                            Prob: 65.0% | Conf: 88.0%
  • git-commit                     Prob: 32.0% | Conf: 88.0%

📊 Token Usage Breakdown:
  • Total Used Tokens:    3977
  • Input Prompt Tokens:  14
  • System Prompt Tokens: 37
  • API Input Tokens:     3209
  • Output Tokens:        768
```

Programmatic TypeScript API:

```typescript
import { selectSkills } from "./index";

const result = await selectSkills({
  userPrompt: "Diagnose database connection leaks and write regression tests",
  options: { maxSkills: 3, threshold: 0.05 },
});

console.log(result.selectedSkills);
// => [ { name: "diagnosing-bugs", probability: 0.61 }, { name: "tdd", probability: 0.38 } ]
```

---

## Workflows

### 1. Pre-Prompt Hook Workflow (Automatic Routing)

The tool acts as a gatekeeper before your agent starts planning:
1. User submits a prompt (e.g., in Codex or Claude Code).
2. The pre-prompt hook intercepts the prompt via stdin.
3. Jev matches the task against the centralized skills bank (`SKILLS_BANK_PATH`).
4. Hook outputs the matching skill instructions directly into the agent's context.

### 2. Multi-Step & Continuation Tasks

For complex tasks (e.g. "Phase 1: investigate, Phase 2: test, Phase 3: deploy"), Jev automatically activates parallel decision questions:
- `primary_skill`: Core/initial action
- `secondary_skill`: Subsequent implementation
- `followup_skill`: Verification, documentation, git, or deployment

---

## Environment Configuration

Configure via environment variables or a `.env` file:

```env
# Required: OpenRouter API Key
OPENROUTER_API_KEY=sk-or-v1-your-key-here
# Optional alias
# JEV_API_KEY=sk-or-v1-your-key-here

# Optional: Jev model slug (defaults to ~typesafe/jev-latest)
MODEL=~typesafe/jev-latest

# Optional: Centralized Skills Bank Directory (defaults to ~/.agents/skills_bank or ./skills)
SKILLS_BANK_PATH=/home/dat/dev/vinuni_aia/P-063/.agents/jev_skills
```

---

## Bundled Hooks & Tools

- **Codex Hook**: [`hooks/codex.ts`](hooks/codex.ts) - Reads JSON or raw text, outputs formatted injection.
- **Claude Code Hook**: [`hooks/claude.ts`](hooks/claude.ts) - Intercepts `UserPromptSubmit` in Claude settings.
- **OpenCode Plugin**: [`plugins/opencode.ts`](plugins/opencode.ts) - Adds `chat:before` hook and `select_skill` tool.
- **Unified Dispatcher**: [`scripts/run-hook.ts`](scripts/run-hook.ts) - Auto-detects caller environment.
- **Backup & Setup Script**: [`scripts/backup-and-setup.sh`](scripts/backup-and-setup.sh) & [`scripts/backup-and-setup.ps1`](scripts/backup-and-setup.ps1).
