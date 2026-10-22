# Context

Glossary of project terms.
- **OtherSkill**: this project and its canonical CLI (`otherskill.ts`). Routes prompts to skills held in a bank. `jev-skill-selector` and legacy `index.ts` are deprecated aliases or predecessors.
- **Bank**: private directory of categorized skill copies (`bankPath`), outside native skill discovery. Never linked into `.claude/skills` or `.agents/skills`.
- **Category**: stable, possibly nested ID (`frontend/ui-ux`) with a description. Stage one of routing chooses categories. A skill can hold a complete copy in several categories.
- **Skill set**: the skills in one category, or the enabled categories together; the candidates stage two chooses from.
- **Harness**: the coding agent host: Claude Code, Codex, Antigravity, OpenCode 1.x.
- **Adapter**: harness-specific integration that calls `find --agent <harness>`: a hook entry (Claude, Codex, Antigravity) or a plugin file (OpenCode).
- **Companion**: optional native `use-otherskill` skill installed by setup that teaches the agent to use the CLI. Disable with `--no-companion`.
- **Launcher**: managed script `~/.local/share/otherskill/bin/otherskill` that runs Bun on a snapshot by absolute path. Hooks call it.
- **Snapshot**: immutable source copy under `~/.local/share/otherskill/installs/release.*` made by the installer or `update`. Launchers and adapters point at one.
- **Scope**: `global` (user home config and hooks) or `project` (nearest `otherskill.config.json`, project hook files and bank).
- **Hook params**: `find` flags (`--max-skills`, `--max-categories`, `--timeout-ms`, `--categories`, `--model`, `--config`, `--home`) that override config for one call and can be embedded in the hook command by setup.
- **Golden dataset**: `golden_set/e2e_golden.json`, 100 prompt cases with expected skills, run through the full CLI by the e2e suite against the fixture bank `tests/fixtures/e2e-bank/`.
