#!/usr/bin/env bash
set -euo pipefail

# Consolidate user skills into one real directory and install the selector's
# supported integrations. Existing data is copied to a timestamped backup
# before any consumer directory is cleaned.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_BANK="${SKILLS_BANK_PATH:-$HOME/.agents/other_skills}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$HOME/.agents/skills_backup_$TIMESTAMP"

command -v bun >/dev/null || { echo "Error: bun is required." >&2; exit 1; }
mkdir -p "$SKILLS_BANK" "$BACKUP_DIR"
echo "Central skills bank: $SKILLS_BANK"
echo "Backup: $BACKUP_DIR"

# Run safe migration via migrate-skills primitive (preserves always-on skills like caveman/superpowers, moves optional, non-destructive, full backup manifest)
echo "Migrating optional skills to central bank..."
bun run "$SCRIPT_DIR/scripts/migrate-skills.ts" --target "$SKILLS_BANK" || true

# Register global binary in PATH
echo "Linking skill_selector CLI globally..."
(cd "$SCRIPT_DIR" && bun link 2>/dev/null || true)

# Fallback skill for harnesses that do not support hooks
for dir in "$HOME/.agents/skills/skill_selector" \
           "$HOME/.claude/skills/skill_selector" \
           "$HOME/.codex/skills/skill_selector" \
           "$SKILLS_BANK/skill_selector"; do
  mkdir -p "$dir"
  cp -aL "$SCRIPT_DIR/SKILL.md" "$dir/SKILL.md"
  [ -f "$SCRIPT_DIR/skills/skill_selector/run.sh" ] && cp -aL "$SCRIPT_DIR/skills/skill_selector/run.sh" "$dir/run.sh"
done

echo "Configuring Claude Code UserPromptSubmit hook..."
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
mkdir -p "$HOME/.claude"
bun -e '
  const fs = require("fs"), path = process.argv[1], command = process.argv[2];
  let data = {}; try { data = JSON.parse(fs.readFileSync(path, "utf8")); } catch {}
  data.hooks ??= {}; data.hooks.UserPromptSubmit ??= [];
  const exists = data.hooks.UserPromptSubmit.some((x) =>
    (x?.hooks ?? []).some((hook) => hook.command === command) || x?.command === command);
  if (!exists) data.hooks.UserPromptSubmit.push({ hooks: [{ type: "command", command, timeout: 30 }] });
  fs.writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
' "$CLAUDE_SETTINGS" "bun run $SCRIPT_DIR/hooks/claude.ts"

echo "Configuring Codex UserPromptSubmit hook..."
CODEX_HOOKS="$HOME/.codex/hooks.json"
mkdir -p "$HOME/.codex"
bun -e '
  const fs = require("fs"), path = process.argv[1], command = process.argv[2];
  let data = {}; try { data = JSON.parse(fs.readFileSync(path, "utf8")); } catch {}
  data.description ??= "Skill selector routing"; data.hooks ??= {};
  data.hooks.UserPromptSubmit ??= [];
  let group = data.hooks.UserPromptSubmit.find((x) => !x.matcher);
  if (!group) { group = { hooks: [] }; data.hooks.UserPromptSubmit.push(group); }
  group.hooks ??= [];
  if (!group.hooks.some((hook) => hook.command === command)) {
    group.hooks.push({ type: "command", command, timeout: 30, additionalContextLimit: 50000 });
  }
  fs.writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
' "$CODEX_HOOKS" "bun run $SCRIPT_DIR/hooks/codex.ts"

echo "Installing OpenCode plugin..."
OPENCODE_PLUGIN_DIR="$HOME/.config/opencode/plugin"
mkdir -p "$OPENCODE_PLUGIN_DIR"
cp "$SCRIPT_DIR/plugins/opencode.ts" "$OPENCODE_PLUGIN_DIR/skill_selector.ts"

if [ -f "$HOME/.config/opencode/opencode.json" ]; then
  bun -e '
    const fs = require("fs"), path = process.argv[1], pluginPath = process.argv[2];
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    data.plugin = Array.isArray(data.plugin) ? data.plugin : [];
    if (!data.plugin.includes(pluginPath)) {
      data.plugin.push(pluginPath);
    }
    fs.writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  ' "$HOME/.config/opencode/opencode.json" "$SCRIPT_DIR/plugins/opencode.ts"
fi

echo "Configuring Antigravity plugin hook..."
GEMINI_CONFIG="$HOME/.gemini/config"
mkdir -p "$GEMINI_CONFIG/plugins/skill_selector"
cp "$SCRIPT_DIR/plugins/antigravity/plugin.json" "$GEMINI_CONFIG/plugins/skill_selector/plugin.json"
cp "$SCRIPT_DIR/plugins/antigravity/hooks.json" "$GEMINI_CONFIG/plugins/skill_selector/hooks.json"

# Do NOT invoke live agy install in tests / CI
if [ -z "${NODE_ENV:-}" ] && [ -z "${CI:-}" ]; then
  if command -v agy >/dev/null 2>&1; then
    echo "Registering Antigravity CLI plugin..."
    agy plugin install "$SCRIPT_DIR/plugins/antigravity" 2>/dev/null || true
  fi
fi
chmod 600 "$SCRIPT_DIR/.env" 2>/dev/null || true

echo
echo "Setup complete. Restart Claude Code, Codex, Antigravity, and OpenCode to load changes."
echo "Codex may ask you to review/trust the new hook via /hooks."
