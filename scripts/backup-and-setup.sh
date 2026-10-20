#!/usr/bin/env bash
set -euo pipefail
# Compatibility entrypoint: keep installation behavior in the typed setup CLI.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v bun >/dev/null || { echo "Error: bun is required." >&2; exit 1; }
bun run "$SCRIPT_DIR/scripts/setup-agent.ts" "$@"
printf '%s\n' 'Skills were not moved. Preview separately with skill_selector migrate --dry-run; use --apply only after reviewing the plan.'
