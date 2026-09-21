# Jev Skill Selector

High-performance, calibrated agent router powered by the **TypeSafe Jev System One** decision model on OpenRouter (`~typesafe/jev-latest`).

Instead of polluting your agent's context window by loading 70+ skills on startup, Jev evaluates each prompt against your skill bank in a single parallel tensor pass (~400–700ms) and dynamically injects **only the necessary skills and their complete instructions** for that specific task.

```
git remote: https://github.com/datamonsterr/jev_auto_select_skills.git
```

---

## 🏛 Architecture: Hooks vs. Skills

We prioritize a **two-tier architecture** for agent harnesses:

| Priority | Strategy | How It Works | Context Bloat | Supported Harnesses |
| :--- | :--- | :--- | :--- | :--- |
| **Priority 1 (Recommended)** | **Lifecycle Hooks & Plugins** | Intercepts user prompt before LLM plans, runs Jev inference (~400ms), and injects matching `SKILL.md` content directly into context. | **0 static skills loaded.** Only relevant skill(s) injected per turn. | Claude Code, Codex, OpenCode, Antigravity |
| **Priority 2 (Fallback)** | **Router Agent Skill** | For harnesses without lifecycle hooks. Install only `jev-skill-selector` into the agent's skills folder. The agent invokes `bun run index.ts "<prompt>" --content` on demand. | **Only 1 skill loaded.** Dynamic retrieval of content when required. | Any agent supporting skills / CLI tools |

---

## ⚡ 1-Step Automated Setup

We provide automated setup scripts for Linux/macOS and Windows:

```bash
# Linux / macOS
chmod +x scripts/backup-and-setup.sh
./scripts/backup-and-setup.sh
```

```powershell
# Windows (PowerShell)
.\scripts\backup-and-setup.ps1
```

**What the setup script automates:**
1. **Backs up & consolidates skills:** Copies existing skills from `~/.agents/skills`, `~/.claude/skills`, `~/.codex/skills` into a centralized bank (`~/.agents/jev_skills/`).
2. **Configures Priority 1 Hooks:** Registers `UserPromptSubmit` hooks in Claude Code (`~/.claude/settings.json`) and Codex (`~/.codex/hooks.json`), OpenCode plugin, and Antigravity plugin.
3. **Installs Priority 2 Fallback Skill:** Leaves only `jev-skill-selector` in `~/.agents/skills/jev-skill-selector` so harnesses without hooks don't load 70+ static skills.

---

## 🔌 Priority 1: Agent Harness Hook Configurations

Hooks automatically trigger on prompt submission, run Jev decision inference, and inject the full `SKILL.md` content into the agent's turn.

### 1. Claude Code Hook (`~/.claude/settings.json`)
Add the `UserPromptSubmit` command hook:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run /absolute/path/to/jev_skill_selector/hooks/claude.ts",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```
*Alternatively, install via plugin spec: `.claude-plugin/plugin.json`.*

### 2. Codex Hook (`~/.codex/hooks.json`)
Add the `UserPromptSubmit` hook with ample context limit for full skill content:

```json
{
  "description": "Jev skill routing",
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run /absolute/path/to/jev_skill_selector/hooks/codex.ts",
            "timeout": 30,
            "additionalContextLimit": 50000
          }
        ]
      }
    ]
  }
}
```
*Alternatively, install via plugin spec: `.codex-plugin/plugin.json`.*

### 3. OpenCode Plugin
1. Copy [`plugins/opencode.ts`](plugins/opencode.ts) to OpenCode's plugin directory:
   ```bash
   mkdir -p ~/.config/opencode/plugin
   cp /absolute/path/to/jev_skill_selector/plugins/opencode.ts ~/.config/opencode/plugin/jev-skill-selector.ts
   ```
2. Or register in `~/.config/opencode/opencode.json`:
   ```json
   {
     "plugin": ["/absolute/path/to/jev_skill_selector/plugins/opencode.ts"],
     "skills": { "paths": ["~/.agents/jev_skills"] }
   }
   ```
*Includes `messages.transform` hook and `select_skill` tool.*

### 4. Antigravity Hook
Antigravity automatically executes `hooks/antigravity.ts` on prompt invocation and receives an ephemeral context message with the selected skill instructions.

---

## 📦 Priority 2: Fallback Skill (When Harness Cannot Use Hooks)

If an agent harness does not support lifecycle hooks, install `jev-skill-selector` as a skill in your harness's skill folder (`~/.agents/skills/jev-skill-selector`):

### Get Full Skill Content for a Task
When the agent needs specialized guidance for a prompt, run:
```bash
bun run index.ts "<user prompt or task>" --content
```

**Output:**
```markdown
### Recommended Agent Skills
🎯 **[Jev Dynamic Skill Routing]**
Task: "Refactor payment service with TDD and make a git commit"
The following specialized skills have been selected for this prompt:

• **tdd** (Probability: 65.0% | Confidence: 88%)
  - Path: `/home/dat/.agents/jev_skills/tdd/SKILL.md`
• **git-commit** (Probability: 32.0% | Confidence: 88%)
  - Path: `/home/dat/.agents/jev_skills/git-commit/SKILL.md`

---
## Skill: tdd
*Location: `/home/dat/.agents/jev_skills/tdd/SKILL.md`*

<full content of tdd/SKILL.md>

---
## Skill: git-commit
*Location: `/home/dat/.agents/jev_skills/git-commit/SKILL.md`*

<full content of git-commit/SKILL.md>
```

### Direct Skill Inspection by Name
```bash
bun run index.ts --skill tdd
```

---

## ⚙️ Skills Directory Resolution & Precedence

Skills are automatically resolved and merged from two standard locations:
1. **Agent Skills (Project-Level)**: `./.agents/jev_skills`
2. **Global Skills (User-Level)**: `~/.agents/jev_skills/`
3. **Precedence**: Local project skills override global skills with the same name.

### Environment Variable Overrides
Configure in your `.env` or shell profile:

```bash
# Required: OpenRouter API Key
export OPENROUTER_API_KEY="sk-or-v1-your-key-here"

# Model slug (defaults to ~typesafe/jev-latest)
export MODEL="~typesafe/jev-latest"

# Optional: Override global skills directory
export GLOBAL_SKILLS_PATH="$HOME/.agents/jev_skills"

# Optional: Override agent skills directory
export AGENT_SKILLS_PATH="./.agents/jev_skills"

# Optional: Toggle hook injection of full SKILL.md content (default: true)
export JEV_INJECT_CONTENT="true"
```

---

## ➕ Adding & Assessing New Skills

### 1. Adding a Skill
Add a directory with a `SKILL.md` in `~/.agents/jev_skills/` (global) or `./.agents/jev_skills/` (project-local):

```bash
mkdir -p ~/.agents/jev_skills/my-skill
cat <<'EOF' > ~/.agents/jev_skills/my-skill/SKILL.md
---
name: my-skill
description: Automate database migrations. Use when user asks about schema versioning or migrations.
---

# Migration Guidelines
Step 1...
EOF
```

### 2. Assessing Skill Placement: `ALWAYS_ON` vs. `JEV_ROUTED`
Skills shouldn't all be routed through Jev. We categorize skills into two types:
- **`ALWAYS_ON`**: Universal personas, output style constraints, or core developer guidelines (e.g. `caveman`, terse-mode, system constraints) that should be active on *every* prompt. Keep these in your harness's normal skills directory (`~/.agents/skills/` or `./.agents/skills/`).
- **`JEV_ROUTED`**: Task-specific, technology, framework, workflow, or diagnostic skills (e.g. `tdd`, `git-commit`, `supabase`, `kubernetes`) that should only consume context when relevant. Keep these in Jev's bank (`~/.agents/jev_skills/` or `./.agents/jev_skills/`).

Use the included assessment script:
```bash
# Quick assessment (heuristic + optional Jev model)
bun run assess /path/to/skill

# Assess and automatically move to Jev bank if JEV_ROUTED
bun run assess /path/to/skill --move

# Move to global bank (~/.agents/jev_skills) instead of project-local
bun run assess /path/to/skill --move --global

# JSON output for integration scripts
bun run assess /path/to/skill --json
```

### 3. Integrated into `find-skills` & `skill-creator`
Both `find-skills` and `skill-creator` skills in `~/.agents/jev_skills/` feature a built-in **`move-to-jev`** step:
- When creating or installing a skill, the agent runs `bun run scripts/assess.ts <skill-dir> --move` automatically.
- Prevents context bloat by moving task-specific skills directly to the Jev bank.

---

## 🎯 Input Token Optimization

Jev is specifically engineered to minimize token usage and latency:
1. **Criteria Sanitization**: Redundant prefixes like *"Use this skill when..."*, *"Activate when the user asks for..."* are stripped to reduce criteria tokens by ~30–40%.
2. **Prompt Compaction**: Oversized code blocks, huge logs, and diffs in the prompt are automatically collapsed into concise summaries before sending to Jev (`compactUserPromptForJev`), keeping routing inference under 500 tokens.
3. **Single Parallel Pass**: Jev classifies and returns probabilities for all candidates in one fast tensor call (~400–700ms), eliminating multi-step LLM overhead.

---

## 💻 CLI Usage & Token Metrics

Fast probability inspection without dumping full files:
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
  • test-driven-development        Prob: 36.0% | Conf: 88.0%

📊 Token Usage Breakdown:
  • Total Used Tokens:    3977
  • Input Prompt Tokens:  14
  • System Prompt Tokens: 37
  • API Input Tokens:     3209 (including skills criteria)
  • Output Tokens:        768
  • Estimated Cost:       $0.000135
```

Return JSON for programmatic consumers:
```bash
bun run index.ts --json "Diagnose memory leak in auth microservice"
```

---

## 🧪 Testing & Benchmarks

```bash
# Run unit and integration tests (31/31 passing)
bun test

# Run single-focus golden set evaluation (12/12 passing)
bun run test:golden

# Run complex multi-step and continuation benchmark (12/12 passing)
bun run test:complex

# Run public online dataset benchmark (MetaTool / ToolE)
bun run test:benchmark
```

### 🌐 Online Dataset Benchmark: MetaTool (ToolE)

Benchmarked against the standardized [MetaTool (ToolE)](https://github.com/HowieHwong/MetaTool) dataset across multi-tool routing, single-tool precision, and tool awareness:

- **Candidate Bank:** 47 tools (`golden_set/metatool_tools.json`)
- **Model:** `~typesafe/jev-latest` via OpenRouter
- **Accuracy:** **12 / 12 (100.0%)**
- **Latency:** **460 ms / decision**

| Case ID | Category | Expected Ground Truth | Actual Primary | Selected Skills | Confidence | Latency | Status |
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
