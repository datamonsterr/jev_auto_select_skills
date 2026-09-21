# Jev Skill Selector

A high-performance agent router and skill selection tool powered by the **TypeSafe Jev System One** decision model on OpenRouter (`~typesafe/jev-latest`).

Instead of polluting agent context windows by loading 70+ skills on startup, Jev evaluates each user prompt against your centralized skill bank in a single parallel tensor pass (~400–700ms) and returns only the 1–3 necessary skills for that specific task.

```
git remote: https://github.com/datamonsterr/jev_auto_select_skills.git
```

---

## ⚡ Quick Machine Setup (Automated)

We provide automated setup scripts for Linux/macOS (`.sh`) and Windows (`.ps1`). These scripts:
1. Consolidate and back up all existing skills from `~/.agents/skills`, `~/.claude/skills`, `~/.codex/skills` into a centralized bank (`~/.agents/skills_bank`).
2. Package and install `jev-skill-selector` as the active gatekeeper skill in `~/.agents/skills/jev-skill-selector`.
3. Configure **Claude Code** and **Codex** hooks to automatically execute Jev on **every user prompt**.
4. Install the **OpenCode** plugin into `~/.config/opencode/plugin/`.

### Linux / macOS:

```bash
# 1. Clone repository
git clone https://github.com/datamonsterr/jev_auto_select_skills.git ~/dev/jev_auto_select_skills
cd ~/dev/jev_auto_select_skills
bun install

# 2. Run automated consolidation & hook setup
chmod +x scripts/backup-and-setup.sh
./scripts/backup-and-setup.sh
```

### Windows (PowerShell):

```powershell
# 1. Clone repository
git clone https://github.com/datamonsterr/jev_auto_select_skills.git $HOME\dev\jev_auto_select_skills
cd $HOME\dev\jev_auto_select_skills
bun install

# 2. Run automated setup
.\scripts\backup-and-setup.ps1
```

---

## 🛠 Manual Configuration Guide

### 1. Environment Variables (`.env` or Shell Profile)

Set the following in your shell profile (`~/.bashrc`, `~/.zshrc`) or create a `.env` in the skill root:

```bash
# Required: OpenRouter API key for TypeSafe Jev model
export OPENROUTER_API_KEY="sk-or-v1-your-openrouter-key-here"
# Optional alias
# export JEV_API_KEY="sk-or-v1-your-openrouter-key-here"

# Model slug
export MODEL="~typesafe/jev-latest"

# Skills Bank path configuration (optional)
# By default reads both:
#  - Agent skills: ./.agents/jev_skills
#  - Global skills: ~/.agents/jev_skills/
#
# Override global skills directory:
# export GLOBAL_SKILLS_PATH="$HOME/.agents/jev_skills"
#
# Override agent skills directory:
# export AGENT_SKILLS_PATH="./.agents/jev_skills"
#
# Override all search paths with a single custom bank:
# export SKILLS_BANK_PATH="/custom/path/to/skills"
```

The selector automatically resolves and merges skills with project-level precedence:
1. `--skills-dir <path>` CLI argument or programmatic option
2. `process.env.SKILLS_BANK_PATH` / `process.env.SKILLS_DIR`
3. Agent skills directory: `process.env.AGENT_SKILLS_PATH` or `./.agents/jev_skills`
4. Global skills directory: `process.env.GLOBAL_SKILLS_PATH` or `~/.agents/jev_skills/`
5. Legacy fallbacks: `~/.agents/skills_bank`, `~/.gemini/config/skills`, `./skills`

---

### 2. Claude Code Hook & Plugin Setup

Claude Code supports event hooks in `~/.claude/settings.json` and agent plugins via `.claude-plugin/plugin.json`.

#### Option A: Hook Configuration (`~/.claude/settings.json`)
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run /path/to/jev_skill_selector/hooks/claude.ts",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

#### Option B: Agent Plugin (`.claude-plugin/plugin.json`)
This repo includes a validated Claude Code plugin. Install it via `claude plugin install` or point to `plugins/claude/plugin.json`.

**How it works:**
- When a prompt is submitted in Claude Code, Claude provides the prompt event JSON on stdin.
- `hooks/claude.ts` queries Jev against your skills bank and returns the Claude hook wire format:
  ```json
  {
    "hookSpecificOutput": {
      "hookEventName": "UserPromptSubmit",
      "additionalContext": "### Recommended Agent Skills\n- **database-schema-design** ..."
    }
  }
  ```
- Claude Code automatically injects the matching skills into the context.

---

### 3. Codex Hook & Plugin Setup

Codex supports hooks via `~/.codex/hooks.json` and agent plugins via `.codex-plugin/plugin.json`.

```json
{
  "description": "Jev skill routing",
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run /path/to/jev_skill_selector/hooks/codex.ts",
            "timeout": 30,
            "additionalContextLimit": 5000
          }
        ]
      }
    ]
  }
}
```

**How it works:**
- When Codex receives a prompt, it sends `{ "prompt": "<user prompt>" }` to `hooks/codex.ts`.
- Jev selects the relevant skills and returns the wire contract:
  ```json
  {
    "hookSpecificOutput": {
      "hookEventName": "UserPromptSubmit",
      "additionalContext": "### Recommended Agent Skills\n- **tdd** ..."
    }
  }
  ```
- Codex injects this context directly into the agent planning phase.

---

### 4. OpenCode Plugin Setup

OpenCode loads TypeScript plugins from `.opencode/plugin/` or `~/.config/opencode/plugin/`, or via `"plugin"` in `opencode.json`.

1. Copy [`plugins/opencode.ts`](plugins/opencode.ts) to your OpenCode plugin directory:
   ```bash
   mkdir -p ~/.config/opencode/plugin
   cp /path/to/jev_skill_selector/plugins/opencode.ts ~/.config/opencode/plugin/jev-skill-selector.ts
   ```

2. Or register it in `~/.config/opencode/opencode.json`:
   ```json
   {
     "plugin": [
       "/path/to/jev_skill_selector/plugins/opencode.ts"
     ],
     "skills": {
       "paths": [
         "~/.agents/jev_skills"
       ]
     }
   }
   ```

**Features in OpenCode:**
- `"experimental.chat.messages.transform"` hook: Automatically enriches model-visible messages with matching skill instructions before LLM execution.
- `"experimental.chat.system.transform"` hook: Supports system prompt transformation.
- `select_skill` tool: Allows OpenCode models to dynamically query the skill bank during complex autonomous runs.

---

## ➕ How to Add New Skills to Your Bank

Once your machine is configured, **never worry about skill context bloat again**.

To add a new skill, create a directory with a `SKILL.md` inside your global skills bank (`~/.agents/jev_skills`) or project-local bank (`./.agents/jev_skills`):

```bash
mkdir -p ~/.agents/jev_skills/my-new-tool
cat <<'EOF' > ~/.agents/jev_skills/my-new-tool/SKILL.md
---
name: my-new-tool
description: Automate database migrations using Liquibase. Use when user asks about database migration or schema versioning.
---

# Liquibase Migration Skill
Instructions and guidelines here...
EOF
```

On your next prompt:
- If you ask about *"database migrations"*, Jev will automatically detect and inject `my-new-tool`.
- If you ask about *"React styling"*, `my-new-tool` is completely ignored, keeping your context clean!

---

## 💻 CLI Usage & Token Inspection

Query skills directly:

```bash
bun run index.ts "How do I refactor code using TDD and commit changes?"
```

Output:
```text
🎯 Jev Skill Selection Result
Prompt: "How do I refactor code using TDD and commit changes?"
Primary Choice: tdd
Confidence: 0.88

Selected Skills:
  • tdd                            Prob: 59.0% | Conf: 88.0%
    Test-driven development. Use when the user wants to build features or fix bugs test-first...
  • test-driven-development        Prob: 36.0% | Conf: 88.0%
    Use when implementing any feature or bugfix, before writing implementation code

📊 Token Usage Breakdown:
  • Total Used Tokens:    3977
  • Input Prompt Tokens:  14
  • System Prompt Tokens: 37
  • API Input Tokens:     3209 (including skills criteria)
  • Output Tokens:        768
  • Estimated Cost:       $0.000135
```

Return JSON for programmatic integration:
```bash
bun run index.ts --json "Diagnose memory leak in auth microservice"
```

---

## 🧪 Testing & Benchmarks

```bash
# Run unit and integration tests (25/25 passing)
bun test

# Run single-focus golden set evaluation (12/12 passing)
bun run test:golden

# Run complex multi-step and continuation benchmark (12/12 passing)
bun run test:complex

# Run public online dataset benchmark (MetaTool / ToolE)
bun run test:benchmark
```

### 🌐 Online Dataset Benchmark: MetaTool (ToolE)

We benchmarked the **TypeSafe Jev Decision Model** against the standardized [MetaTool (ToolE)](https://github.com/HowieHwong/MetaTool) dataset (referenced on Hugging Face). The benchmark evaluates a bank of 47 candidate tools across three critical challenges:
1. **Multi-Tool Routing**: Identifying multiple distinct tools required in a single user prompt (e.g. Finance + News, Rental Search + Maps).
2. **Single-Tool Precision**: Disambiguating specific tools (e.g. Repository Analysis, Legal Lookup, Natural Disasters, NASA Imagery).
3. **Tool-Usage Awareness**: Correctly deciding **NOT** to invoke tools (`none`) on conversational or pure reasoning queries, preventing false triggers.

#### Benchmark Execution Results (`bun run test:benchmark`)

- **Dataset:** MetaTool / ToolE (`golden_set/metatool_benchmark.json`)
- **Candidate Bank:** 47 tools (`golden_set/metatool_tools.json`)
- **Model:** `~typesafe/jev-latest` via OpenRouter
- **Overall Accuracy:** **12 / 12 (100.0%)**
- **Average Latency:** **460 ms / decision**

| Case ID | Category | Expected Ground Truth | Actual Primary | Selected Skills (Top 2) | Confidence | Latency | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `meta-01-finance-news` | Multi-Tool | `FinanceTool`, `NewsTool` | `FinanceTool` | `FinanceTool`, `NewsTool` | 91% | 808 ms | **PASS** ✅ |
| `meta-02-finance-course` | Multi-Tool | `FinanceTool`, `CourseTool` | `FinanceTool` | `FinanceTool`, `CourseTool` | 78% | 459 ms | **PASS** ✅ |
| `meta-03-house-map` | Multi-Tool | `HouseRentingTool`, `MapTool` | `HouseRentingTool` | `HouseRentingTool`, `MapTool` | 93% | 503 ms | **PASS** ✅ |
| `meta-04-weather-trip` | Multi-Tool | `WeatherTool`, `TripTool` | `WeatherTool` | `WeatherTool`, `TripAdviceTool` | 39% | 463 ms | **PASS** ✅ |
| `meta-05-job-resume` | Multi-Tool | `JobTool`, `ResumeTool` | `JobTool` | `JobTool` | 100% | 381 ms | **PASS** ✅ |
| `meta-06-chart-data` | Multi-Tool | `ChartTool`, `DataRetrievalTool` | `ChartTool` | `ChartTool` | 98% | 461 ms | **PASS** ✅ |
| `meta-07-repo-search` | Single-Tool | `RepoTool` | `RepoTool` | `RepoTool` | 100% | 401 ms | **PASS** ✅ |
| `meta-08-law-search` | Single-Tool | `LawTool` | `LawTool` | `LawTool` | 99% | 442 ms | **PASS** ✅ |
| `meta-09-earthquake` | Single-Tool | `EarthquakeTool` | `EarthquakeTool` | `EarthquakeTool` | 98% | 454 ms | **PASS** ✅ |
| `meta-10-nasa` | Single-Tool | `NASATool` | `NASATool` | `NASATool` | 99% | 384 ms | **PASS** ✅ |
| `meta-11-awareness-chat` | Awareness | *none (no tool)* | `none` | *empty* | 0% | 378 ms | **PASS** ✅ |
| `meta-12-awareness-math` | Awareness | *none (no tool)* | `none` | *empty* | 0% | 388 ms | **PASS** ✅ |

Detailed JSON metrics and execution logs are saved to `test-results/metatool_benchmark_report.json`.
