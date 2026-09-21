#!/usr/bin/env bash
set -euo pipefail

# Consolidate user skills into one real directory and install the selector's
# supported integrations. Existing data is copied to a timestamped backup
# before any consumer directory is cleaned.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_BANK="${SKILLS_BANK_PATH:-$HOME/.agents/jev_skills}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$HOME/.agents/skills_backup_$TIMESTAMP"

command -v bun >/dev/null || { echo "Error: bun is required." >&2; exit 1; }
mkdir -p "$SKILLS_BANK" "$BACKUP_DIR"
echo "Central skills bank: $SKILLS_BANK"
echo "Backup: $BACKUP_DIR"

copy_skill_tree() {
  local source="$1" name target
  name="$(basename "$source")"
  target="$SKILLS_BANK/$name"
  cp -aL "$source" "$BACKUP_DIR/$name"
  [ -e "$target" ] || cp -aL "$source" "$target"
}

consolidate_dir() {
  local dir="$1" preserve_system="${2:-false}"
  [ -d "$dir" ] || return 0
  while IFS= read -r -d '' item; do
    [ "$preserve_system" = true ] && [ "$(basename "$item")" = ".system" ] && continue
    if [ -L "$item" ] && [ ! -e "$item" ]; then
      rm -f -- "$item"
      continue
    fi
    copy_skill_tree "$item"
    rm -rf -- "$item"
  done < <(find -P "$dir" -mindepth 1 -maxdepth 1 -print0)
}

echo "Consolidating existing user skills..."
consolidate_dir "$HOME/.agents/skills"
consolidate_dir "$HOME/.claude/skills"
consolidate_dir "$HOME/.codex/skills" true
consolidate_dir "$HOME/.gemini/config/skills"
consolidate_dir "$HOME/.config/opencode/skills"

# Add bundled skills without deleting the source checkout.
if [ -d "$SCRIPT_DIR/.agents/jev_skills" ]; then
  while IFS= read -r -d '' item; do copy_skill_tree "$item"; done \
    < <(find -P "$SCRIPT_DIR/.agents/jev_skills" -mindepth 1 -maxdepth 1 -type d -print0)
elif [ -d "$SCRIPT_DIR/skills" ]; then
  while IFS= read -r -d '' item; do copy_skill_tree "$item"; done \
    < <(find -P "$SCRIPT_DIR/skills" -mindepth 1 -maxdepth 1 -type d -print0)
fi
# Register global binary in PATH
echo "Linking jev-skill-selector CLI globally..."
(cd "$SCRIPT_DIR" && bun link 2>/dev/null || true)

# Fallback skill for harnesses that do not support hooks:
# Install jev-skill-selector as the ONLY skill in standard agent directories
for dir in "$HOME/.agents/skills/jev-skill-selector" \
           "$HOME/.claude/skills/jev-skill-selector" \
           "$HOME/.codex/skills/jev-skill-selector" \
           "$SKILLS_BANK/jev-skill-selector"; do
  mkdir -p "$dir"
  cp -aL "$SCRIPT_DIR/SKILL.md" "$dir/SKILL.md"
  [ -f "$SCRIPT_DIR/skills/jev-skill-selector/run.sh" ] && cp -aL "$SCRIPT_DIR/skills/jev-skill-selector/run.sh" "$dir/run.sh"
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
  data.description ??= "Jev skill routing"; data.hooks ??= {};
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
cp "$SCRIPT_DIR/plugins/opencode.ts" "$OPENCODE_PLUGIN_DIR/jev-skill-selector.ts"
rm -f "$OPENCODE_PLUGIN_DIR/jev-skill-selector.ts.disabled-backup"

if [ -f "$HOME/.config/opencode/opencode.json" ]; then
  bun -e '
    const fs = require("fs"), path = process.argv[1], skills = process.argv[2], pluginPath = process.argv[3];
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    data.skills ??= {};
    data.skills.paths = Array.from(new Set([...(data.skills.paths || []), skills]));
    data.plugin = Array.isArray(data.plugin) ? data.plugin : [];
    if (!data.plugin.includes(pluginPath)) {
      data.plugin.push(pluginPath);
    }
    fs.writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  ' "$HOME/.config/opencode/opencode.json" "$SKILLS_BANK" "$SCRIPT_DIR/plugins/opencode.ts"
fi

echo "Configuring Antigravity skills fallback and plugin hook..."
GEMINI_CONFIG="$HOME/.gemini/config"
mkdir -p "$GEMINI_CONFIG/plugins/jev-skill-selector"
cp "$SCRIPT_DIR/plugins/antigravity/plugin.json" "$GEMINI_CONFIG/plugins/jev-skill-selector/plugin.json"
cp "$SCRIPT_DIR/plugins/antigravity/hooks.json" "$GEMINI_CONFIG/plugins/jev-skill-selector/hooks.json"
cat > "$GEMINI_CONFIG/skills.json" <<EOF
{
  "entries": [{ "path": "$SKILLS_BANK" }]
}
EOF
if command -v agy >/dev/null 2>&1; then
  echo "Registering Antigravity CLI plugin..."
  agy plugin install "$SCRIPT_DIR/plugins/antigravity" 2>/dev/null || true
fi
chmod 600 "$SCRIPT_DIR/.env" 2>/dev/null || true

echo
echo "Setup complete. Restart Claude Code, Codex, and OpenCode to load changes."
echo "Codex may ask you to review/trust the new hook via /hooks."
