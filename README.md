# Jev Skill Selector

A high-performance agent router and skill selection tool powered by the **TypeSafe Jev System One** decision model on OpenRouter (`~typesafe/jev-latest`).

It dynamically analyzes user prompts and technical tasks against a bank of agent skills, selecting the most relevant skills with epistemically calibrated probabilities and confidence scores.

## Key Features

- **Decision-Native**: Uses TypeSafe AI's Jev model via OpenRouter's `/api/alpha/decisions` endpoint for sub-second, structured semantic routing without autoregressive chat latency or hallucinations.
- **Strictly Scoped Decisions**: State includes all skill names, descriptions, and "when to use" triggers; decision choices are strictly limited to valid skill names (+ `none`).
- **Resilient Execution**: Built-in 3-retry mechanism with exponential backoff to handle API rate limits (15–20 RPM).
- **Universal Integrations**:
  - **Codex Hook** (`hooks/codex.ts`)
  - **Claude Hook** (`hooks/claude.ts`)
  - **OpenCode Plugin** (`plugins/opencode.ts`)
  - **Unified Dispatcher** (`scripts/run-hook.ts`)
  - **Agent Skill** (`skills/jev-skill-selector/SKILL.md`)
  - **Programmatic TypeScript API** (`index.ts`)
- **TDD-Backed & 100% Golden Set Accuracy**: Validated on complex software engineering benchmarks covering testing, debugging, git, GitOps, DB design, UI/UX, and business analysis.

---

## Architecture

```
jev_skill_selector/
├── lib/
│   ├── model.ts           # Types, schemas, filtering, and formatting
│   ├── provider.ts        # JevProvider with retry backoff & OpenRouter client
│   ├── system_prompt.ts   # Decision routing prompts and instructions
│   └── parse_skill.ts     # Markdown frontmatter and trigger parser
├── hooks/
│   ├── codex.ts           # Codex pre-prompt & tool hook
│   └── claude.ts          # Claude Code / Desktop prompt hook
├── plugins/
│   └── opencode.ts        # OpenCode plugin with chat:before hook & tool
├── scripts/
│   ├── run-hook.ts        # Unified runner with auto environment detection
│   └── test-golden.ts     # Golden set benchmark test runner
├── golden_set/
│   └── testset.json       # 12 complex software engineering evaluation cases
├── skills/                # 75+ agent skill definitions
├── tests/                 # Unit and integration test suite
└── index.ts               # Programmatic API & CLI entrypoint
```

---

## Installation & Setup

Requirements: [Bun](https://bun.com) v1.0+

```bash
# Clone and install dependencies
bun install
```

Ensure your environment variables are configured in `.env`:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
MODEL=~typesafe/jev-latest
```

---

## CLI Usage

### Basic Query

```bash
bun run index.ts "How do I refactor code using TDD and commit changes?"
```

Output:
```
🎯 Jev Skill Selection Result
Prompt: "How do I refactor code using TDD and commit changes?"
Primary Choice: tdd
Confidence: 0.98

Selected Skills:
  • tdd                            Prob: 98.0% | Conf: 98.0%
    Test-driven development. Use when the user wants to build features or fix bugs test-first...
```

### JSON Output

```bash
bun run index.ts --json "Configure Kubernetes manifests and ArgoCD application for GitOps"
```

### Advanced Options

```bash
bun run index.ts \
  --prompt "Deploy Kubernetes services via GitOps" \
  --system "You are a senior DevOps engineer" \
  --skills-dir ./skills \
  --threshold 0.05 \
  --max-skills 3
```

---

## Hook & Plugin Integrations

### 1. Unified Dispatcher (Auto Environment Detection)

Piping stdin automatically detects whether it is running under Codex, Claude, OpenCode, or CLI:

```bash
echo '{"prompt": "Refactor payment service with red-green-refactor loop"}' | bun run hook
```

You can also explicitly pass `--mode=<codex|claude|opencode|cli>`:

```bash
bun run hook --mode=claude "Build an accessible data table with shadcn/ui"
```

### 2. Codex Hook

```bash
echo '{"prompt": "Generate a conventional commit message for staged changes"}' | bun run hook:codex
```

Returns JSON:
```json
{
  "prompt": "Generate a conventional commit message for staged changes",
  "injectedContext": "### Recommended Agent Skills\n- **git-commit** ...",
  "skills": [{ "name": "git-commit", "probability": 0.94, "confidence": 0.94 }]
}
```

### 3. Claude Hook

```bash
echo '{"prompt": "Build an accessible data table with shadcn/ui"}' | bun run hook:claude
```

Outputs formatted markdown skill context directly into Claude Code's pre-prompt.

### 4. OpenCode Plugin

Import and add to your OpenCode configuration:

```typescript
import jevSkillSelectorPlugin from "./plugins/opencode";

export default {
  plugins: [
    jevSkillSelectorPlugin({
      skillsDir: "./skills",
      threshold: 0.05,
      autoInject: true,
    }),
  ],
};
```

This registers:
- An automatic `"chat:before"` hook that enriches user messages with matching skills.
- A `select_skill` agent tool that LLMs can call dynamically.

---

## Programmatic TypeScript API

```typescript
import { selectSkills, loadSkillsFromDir, JevProvider } from "./index";

const result = await selectSkills({
  userPrompt: "Need to run opencode web server and make commits",
  systemPrompt: "Follow conventional commits",
  options: {
    threshold: 0.05,
    maxSkills: 3,
  },
});

console.log(result.primarySkill);
// => "opencode"

console.log(result.selectedSkills);
// => [ { name: "opencode", probability: 0.94, confidence: 0.98 }, ... ]
```

---

## Testing & Golden Evaluation

### Unit & Integration Tests

```bash
bun test
```

Runs all tests in `tests/`:
- `tests/parse_skill.test.ts`: Frontmatter extraction, "When to Use" parser, state & criteria generation.
- `tests/model.test.ts`: Skill filtering, thresholds, confidence formatting, system prompts.
- `tests/provider.test.ts`: Retry mechanism (3 retries on 429/503), error handling, Jev decision responses.
- `tests/hooks.test.ts`: Codex hook, Claude hook, OpenCode plugin, auto environment detection.
- `tests/golden_eval.test.ts`: Testset schema verification and live Jev integration.

### Golden Set Benchmark

```bash
bun run test:golden
```

Evaluates 12 complex software engineering test cases against the live TypeSafe Jev model:

| ID | Category | Expected | Result | Confidence |
| :--- | :--- | :--- | :--- | :--- |
| `case-01-tdd` | testing | `tdd`, `test-driven-development` | **PASS** (`tdd`) | 92% |
| `case-02-debugging` | debugging | `diagnosing-bugs`, `systematic-debugging` | **PASS** (`systematic-debugging`) | 95% |
| `case-03-git-commit` | git | `git-commit`, `conventional-commits` | **PASS** (`git-commit`) | 94% |
| `case-04-gitops-k8s` | devops | `gitops`, `kubernetes`, `deployment` | **PASS** (`gitops`) | 97% |
| `case-05-db-schema` | database | `database-schema-design` | **PASS** (`database-schema-design`) | 100% |
| `case-06-ui-styling` | frontend | `ui-styling`, `ui-ux-pro-max`, `frontend-design` | **PASS** (`ui-styling`) | 100% |
| `case-07-ba-elicitation` | requirements | `ask-why-ba` | **PASS** (`ask-why-ba`) | 100% |
| `case-08-opencode-cli` | tooling | `opencode` | **PASS** (`opencode`) | 100% |
| `case-09-worktrees` | git | `using-git-worktrees` | **PASS** (`using-git-worktrees`) | 100% |
| `case-10-mermaid` | documentation | `mermaid-diagrams` | **PASS** (`mermaid-diagrams`) | 100% |
| `case-11-diataxis-docs` | documentation | `documentation-writer`, `documentation` | **PASS** (`documentation-writer`) | 100% |
| `case-12-verification` | quality | `verification-before-completion`, `quality-checks` | **PASS** (`verification-before-completion`) | 100% |

**Overall Accuracy: 12/12 (100.0%)** with an average latency of ~700ms per decision.
