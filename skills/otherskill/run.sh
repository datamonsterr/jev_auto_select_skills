#!/usr/bin/env bash
set -euo pipefail

# OtherSkill Runner
# Discovers the otherskill CLI via PATH, environment variable, or known paths.

# 1. Global binary in PATH (via bun link or global install)
if command -v otherskill >/dev/null 2>&1; then
  exec otherskill "$@"
fi

# Deprecated aliases
if command -v skill_selector >/dev/null 2>&1; then
  exec skill_selector "$@"
fi

if command -v jev-skill-selector >/dev/null 2>&1; then
  exec jev-skill-selector "$@"
fi

# 2. Environment variable override
if [ -n "${OTHERSKILL_PATH:-}" ] && [ -f "$OTHERSKILL_PATH/index.ts" ]; then
  exec bun run "$OTHERSKILL_PATH/index.ts" "$@"
fi

# Legacy names
if [ -n "${SKILL_SELECTOR_PATH:-}" ] && [ -f "$SKILL_SELECTOR_PATH/index.ts" ]; then
  exec bun run "$SKILL_SELECTOR_PATH/index.ts" "$@"
fi

if [ -n "${JEV_PATH:-}" ] && [ -f "$JEV_PATH/index.ts" ]; then
  exec bun run "$JEV_PATH/index.ts" "$@"
fi

# 3. Known clone directory candidates
CANDIDATES=(
  "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  "$HOME/dev/other-skill"
  "$HOME/dev/skill_selector"
  "$HOME/dev/jev_skill_selector"
  "$HOME/dev/other-skill"
  "$HOME/.agents/skills/otherskill"
  "$HOME/.agents/skills/skill_selector"
  "$HOME/.agents/jev_skill_selector"
)

for cand in "${CANDIDATES[@]}"; do
  if [ -f "$cand/index.ts" ]; then
    exec bun run "$cand/index.ts" "$@"
  fi
done

echo "Error: otherskill was not found in PATH or standard directories." >&2
echo "Please run 'bun link' inside your cloned repository," >&2
echo "or set 'export OTHERSKILL_PATH=/path/to/other-skill'." >&2
exit 1
