#!/usr/bin/env bash
set -euo pipefail

# Skill Selector Runner
# Discovers the skill_selector CLI via PATH, environment variable, or known paths.

# 1. Global binary in PATH (via bun link or global install)
if command -v skill_selector >/dev/null 2>&1; then
  exec skill_selector "$@"
fi

if command -v jev-skill-selector >/dev/null 2>&1; then
  exec jev-skill-selector "$@"
fi

# 2. Environment variable override
if [ -n "${SKILL_SELECTOR_PATH:-}" ] && [ -f "$SKILL_SELECTOR_PATH/index.ts" ]; then
  exec bun run "$SKILL_SELECTOR_PATH/index.ts" "$@"
fi

if [ -n "${JEV_PATH:-}" ] && [ -f "$JEV_PATH/index.ts" ]; then
  exec bun run "$JEV_PATH/index.ts" "$@"
fi

# 3. Known clone directory candidates
CANDIDATES=(
  "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  "$HOME/dev/skill_selector"
  "$HOME/dev/jev_skill_selector"
  "$HOME/dev/jev_auto_select_skills"
  "$HOME/.agents/skills/skill_selector"
  "$HOME/.agents/jev_skill_selector"
)

for cand in "${CANDIDATES[@]}"; do
  if [ -f "$cand/index.ts" ]; then
    exec bun run "$cand/index.ts" "$@"
  fi
done

echo "Error: skill_selector was not found in PATH or standard directories." >&2
echo "Please run 'bun link' inside your cloned repository," >&2
echo "or set 'export SKILL_SELECTOR_PATH=/path/to/skill_selector'." >&2
exit 1
