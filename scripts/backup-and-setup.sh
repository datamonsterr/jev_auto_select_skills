#!/usr/bin/env bash
set -e

# ==============================================================================
# Jev Skill Selector: Centralized Skills Bank Setup & Hook Installer
# ==============================================================================
# This script:
# 1. Backs up existing skills in ~/.agents/skills, ~/.claude/skills, ~/.codex/skills
# 2. Moves skills into a centralized skills bank (~/.agents/skills_bank)
# 3. Packages and installs jev-skill-selector into ~/.agents/skills
# 4. Configures Claude Code and Codex hooks to auto-route every prompt with Jev
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_BANK="${SKILLS_BANK_PATH:-$HOME/.agents/skills_bank}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$HOME/.agents/skills_backup_$TIMESTAMP"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "\n${BLUE}======================================================${NC}"
echo -e "${BLUE}  🚀 Jev Skill Selector: Automated Machine Setup      ${NC}"
echo -e "${BLUE}======================================================${NC}\n"

# 1. Verify Bun runtime
if ! command -v bun &> /dev/null; then
    echo -e "${RED}Error: 'bun' runtime is not installed.${NC}"
    echo "Please install Bun first: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi
echo -e "${GREEN}✓ Bun runtime detected:${NC} $(bun --version)"

# 2. Create Skills Bank and Backup Directories
echo -e "\n${YELLOW}Step 1: Setting up centralized skills bank & backup directory...${NC}"
mkdir -p "$SKILLS_BANK"
mkdir -p "$BACKUP_DIR"
echo -e "Skills Bank Path : ${GREEN}$SKILLS_BANK${NC}"
echo -e "Backup Directory : ${GREEN}$BACKUP_DIR${NC}"

# 3. Collect and Move Skills from Agents, Claude, and Codex directories
echo -e "\n${YELLOW}Step 2: Consolidating skills into skills bank...${NC}"

SOURCE_DIRS=(
    "$HOME/.agents/skills"
    "$HOME/.claude/skills"
    "$HOME/.codex/skills"
    "$SCRIPT_DIR/skills"
)

MOVED_COUNT=0
for src in "${SOURCE_DIRS[@]}"; do
    if [ -d "$src" ]; then
        echo "Scanning $src..."
        for item in "$src"/*; do
            if [ -d "$item" ]; then
                SKILL_NAME="$(basename "$item")"
                # Do not move jev-skill-selector itself
                if [ "$SKILL_NAME" == "jev-skill-selector" ]; then
                    continue
                fi
                
                # Copy to backup
                cp -r "$item" "$BACKUP_DIR/"
                
                # Move to centralized skills bank if not already present
                if [ ! -d "$SKILLS_BANK/$SKILL_NAME" ]; then
                    cp -r "$item" "$SKILLS_BANK/"
                    MOVED_COUNT=$((MOVED_COUNT + 1))
                fi
                
                # Remove from original agent folder if it's not the repo's skills folder
                if [[ "$src" != "$SCRIPT_DIR/skills" ]]; then
                    rm -rf "$item"
                fi
            fi
        done
    fi
done

echo -e "${GREEN}✓ Consolidated and backed up skills.${NC} Bank now contains: $(ls -1 "$SKILLS_BANK" | wc -l) skills."

# 4. Install jev-skill-selector into ~/.agents/skills
echo -e "\n${YELLOW}Step 3: Installing jev-skill-selector as the active router skill...${NC}"
mkdir -p "$HOME/.agents/skills"
TARGET_SKILL_DIR="$HOME/.agents/skills/jev-skill-selector"

rm -rf "$TARGET_SKILL_DIR"
ln -sf "$SCRIPT_DIR" "$TARGET_SKILL_DIR" 2>/dev/null || cp -r "$SCRIPT_DIR" "$TARGET_SKILL_DIR"
echo -e "${GREEN}✓ Linked jev-skill-selector to:${NC} $TARGET_SKILL_DIR"

# 5. Environment configuration
echo -e "\n${YELLOW}Step 4: Checking environment configuration...${NC}"
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$SCRIPT_DIR/.env.example" ]; then
        cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
        echo -e "${YELLOW}Created .env from .env.example.${NC} Please update OPENROUTER_API_KEY in: $ENV_FILE"
    fi
else
    echo -e "${GREEN}✓ .env found:${NC} $ENV_FILE"
fi

# 6. Configure Claude Code Hook (~/.claude/settings.json)
echo -e "\n${YELLOW}Step 5: Configuring Claude Code Hook...${NC}"
CLAUDE_CONFIG_DIR="$HOME/.claude"
CLAUDE_SETTINGS="$CLAUDE_CONFIG_DIR/settings.json"
mkdir -p "$CLAUDE_CONFIG_DIR"

CLAUDE_HOOK_CMD="bun run $SCRIPT_DIR/hooks/claude.ts"

if [ -f "$CLAUDE_SETTINGS" ]; then
    # Use node/bun to cleanly merge hook into json
    bun -e '
    const fs = require("fs");
    const path = "'"$CLAUDE_SETTINGS"'";
    let data = {};
    try { data = JSON.parse(fs.readFileSync(path, "utf8")); } catch(e){}
    data.hooks = data.hooks || {};
    data.hooks.UserPromptSubmit = data.hooks.UserPromptSubmit || [];
    const cmd = "'"$CLAUDE_HOOK_CMD"'";
    const exists = data.hooks.UserPromptSubmit.some(h => (typeof h === "string" ? h === cmd : h.command === cmd));
    if (!exists) {
        data.hooks.UserPromptSubmit.push({ command: cmd });
        fs.writeFileSync(path, JSON.stringify(data, null, 2));
        console.log("Hook added to Claude settings.json");
    } else {
        console.log("Hook already present in Claude settings.json");
    }
    '
else
    cat <<EOF > "$CLAUDE_SETTINGS"
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "command": "$CLAUDE_HOOK_CMD"
      }
    ]
  }
}
EOF
    echo -e "${GREEN}✓ Created Claude settings with UserPromptSubmit hook:${NC} $CLAUDE_SETTINGS"
fi

# 7. Configure Codex Hook (~/.codex/config.json)
echo -e "\n${YELLOW}Step 6: Configuring Codex Hook...${NC}"
CODEX_CONFIG_DIR="$HOME/.codex"
CODEX_CONFIG="$CODEX_CONFIG_DIR/config.json"
mkdir -p "$CODEX_CONFIG_DIR"
CODEX_HOOK_CMD="bun run $SCRIPT_DIR/hooks/codex.ts"

if [ -f "$CODEX_CONFIG" ]; then
    bun -e '
    const fs = require("fs");
    const path = "'"$CODEX_CONFIG"'";
    let data = {};
    try { data = JSON.parse(fs.readFileSync(path, "utf8")); } catch(e){}
    data.hooks = data.hooks || {};
    data.hooks.pre_prompt = "'"$CODEX_HOOK_CMD"'";
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
    console.log("Hook configured in Codex config.json");
    '
else
    cat <<EOF > "$CODEX_CONFIG"
{
  "hooks": {
    "pre_prompt": "$CODEX_HOOK_CMD"
  }
}
EOF
    echo -e "${GREEN}✓ Created Codex config with pre_prompt hook:${NC} $CODEX_CONFIG"
fi

# 8. Configure OpenCode Plugin
echo -e "\n${YELLOW}Step 7: Configuring OpenCode Plugin...${NC}"
OPENCODE_PLUGIN_DIR="$HOME/.config/opencode/plugins"
mkdir -p "$OPENCODE_PLUGIN_DIR"
ln -sf "$SCRIPT_DIR/plugins/opencode.ts" "$OPENCODE_PLUGIN_DIR/jev-skill-selector.ts" 2>/dev/null || cp "$SCRIPT_DIR/plugins/opencode.ts" "$OPENCODE_PLUGIN_DIR/jev-skill-selector.ts"
echo -e "${GREEN}✓ Linked OpenCode plugin to:${NC} $OPENCODE_PLUGIN_DIR/jev-skill-selector.ts"

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}  🎉 Setup Complete!                                  ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "Centralized Skills Bank : ${BLUE}$SKILLS_BANK${NC}"
echo -e "Backup Location        : ${BLUE}$BACKUP_DIR${NC}"
echo -e "Router Skill           : ${BLUE}$TARGET_SKILL_DIR${NC}"
echo ""
echo -e "${YELLOW}How to add new skills in the future:${NC}"
echo -e "  Simply create a folder with a SKILL.md in your skills bank:"
echo -e "  ${BLUE}mkdir -p $SKILLS_BANK/my-new-skill${NC}"
echo -e "  ${BLUE}touch $SKILLS_BANK/my-new-skill/SKILL.md${NC}"
echo -e "  Jev will automatically discover and route to it on your next prompt!"
echo ""
