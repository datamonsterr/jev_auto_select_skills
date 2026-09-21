#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { dirnameCompat } from "../lib/compat";

export interface SetupOptions {
  repoDir?: string;
  homeDir?: string;
  dryRun?: boolean;
  hooksOnly?: boolean;
  skillOnly?: boolean;
  silent?: boolean;
}

export interface SetupResult {
  target: string;
  success: boolean;
  hookConfigured: boolean;
  skillInstalled: boolean;
  pluginConfigured?: boolean;
  message?: string;
  filesModified: string[];
}

export function getRepoDir(customRepo?: string): string {
  if (customRepo) return path.resolve(customRepo);
  return path.resolve(dirnameCompat(import.meta), "..");
}

export function getHomeDir(customHome?: string): string {
  if (customHome) return path.resolve(customHome);
  return os.homedir();
}

/**
 * Setup Claude Code (Priority 1 UserPromptSubmit hook + Priority 2 fallback skill)
 */
export function setupClaude(options: SetupOptions = {}): SetupResult {
  const repoDir = getRepoDir(options.repoDir);
  const homeDir = getHomeDir(options.homeDir);
  const filesModified: string[] = [];
  let hookConfigured = false;
  let skillInstalled = false;

  const hookScript = path.join(repoDir, "hooks", "claude.ts");
  const command = `bun run ${hookScript}`;

  // 1. Configure Hook in ~/.claude/settings.json
  if (!options.skillOnly) {
    const claudeDir = path.join(homeDir, ".claude");
    const settingsPath = path.join(claudeDir, "settings.json");

    if (!options.dryRun && !fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    let settings: any = {};
    if (fs.existsSync(settingsPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      } catch {
        settings = {};
      }
    }

    settings.hooks ??= {};
    settings.hooks.UserPromptSubmit ??= [];

    const alreadyExists = settings.hooks.UserPromptSubmit.some(
      (entry: any) =>
        entry?.command === command ||
        (Array.isArray(entry?.hooks) && entry.hooks.some((h: any) => h?.command === command))
    );

    if (!alreadyExists) {
      settings.hooks.UserPromptSubmit.push({
        hooks: [{ type: "command", command, timeout: 30 }],
      });
      if (!options.dryRun) {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
      }
      filesModified.push(settingsPath);
    }
    hookConfigured = true;
  }

  // 2. Install Fallback Skill in ~/.claude/skills/jev-skill-selector
  if (!options.hooksOnly) {
    const skillTarget = path.join(homeDir, ".claude", "skills", "jev-skill-selector");
    const skillMd = path.join(repoDir, "skills", "jev-skill-selector", "SKILL.md");
    const runSh = path.join(repoDir, "skills", "jev-skill-selector", "run.sh");

    if (!options.dryRun) {
      fs.mkdirSync(skillTarget, { recursive: true });
      if (fs.existsSync(skillMd)) {
        fs.copyFileSync(skillMd, path.join(skillTarget, "SKILL.md"));
      }
      if (fs.existsSync(runSh)) {
        fs.copyFileSync(runSh, path.join(skillTarget, "run.sh"));
        try { fs.chmodSync(path.join(skillTarget, "run.sh"), 0o755); } catch {}
      }
    }
    filesModified.push(skillTarget);
    skillInstalled = true;
  }

  return {
    target: "claude",
    success: true,
    hookConfigured,
    skillInstalled,
    filesModified,
  };
}

/**
 * Setup Codex CLI (Priority 1 UserPromptSubmit hook + Priority 2 fallback skill)
 */
export function setupCodex(options: SetupOptions = {}): SetupResult {
  const repoDir = getRepoDir(options.repoDir);
  const homeDir = getHomeDir(options.homeDir);
  const filesModified: string[] = [];
  let hookConfigured = false;
  let skillInstalled = false;

  const hookScript = path.join(repoDir, "hooks", "codex.ts");
  const command = `bun run ${hookScript}`;

  // 1. Configure Hook in ~/.codex/hooks.json
  if (!options.skillOnly) {
    const codexDir = path.join(homeDir, ".codex");
    const hooksPath = path.join(codexDir, "hooks.json");

    if (!options.dryRun && !fs.existsSync(codexDir)) {
      fs.mkdirSync(codexDir, { recursive: true });
    }

    let data: any = {};
    if (fs.existsSync(hooksPath)) {
      try {
        data = JSON.parse(fs.readFileSync(hooksPath, "utf-8"));
      } catch {
        data = {};
      }
    }

    data.description ??= "Jev skill routing";
    data.hooks ??= {};
    data.hooks.UserPromptSubmit ??= [];

    let group = data.hooks.UserPromptSubmit.find((x: any) => !x.matcher);
    if (!group) {
      group = { hooks: [] };
      data.hooks.UserPromptSubmit.push(group);
    }
    group.hooks ??= [];

    const alreadyExists = group.hooks.some((h: any) => h?.command === command);
    if (!alreadyExists) {
      group.hooks.push({
        type: "command",
        command,
        timeout: 30,
        additionalContextLimit: 50000,
      });
      if (!options.dryRun) {
        fs.writeFileSync(hooksPath, JSON.stringify(data, null, 2) + "\n");
      }
      filesModified.push(hooksPath);
    }
    hookConfigured = true;
  }

  // 2. Install Fallback Skill in ~/.codex/skills/jev-skill-selector
  if (!options.hooksOnly) {
    const skillTarget = path.join(homeDir, ".codex", "skills", "jev-skill-selector");
    const skillMd = path.join(repoDir, "skills", "jev-skill-selector", "SKILL.md");
    const runSh = path.join(repoDir, "skills", "jev-skill-selector", "run.sh");

    if (!options.dryRun) {
      fs.mkdirSync(skillTarget, { recursive: true });
      if (fs.existsSync(skillMd)) {
        fs.copyFileSync(skillMd, path.join(skillTarget, "SKILL.md"));
      }
      if (fs.existsSync(runSh)) {
        fs.copyFileSync(runSh, path.join(skillTarget, "run.sh"));
        try { fs.chmodSync(path.join(skillTarget, "run.sh"), 0o755); } catch {}
      }
    }
    filesModified.push(skillTarget);
    skillInstalled = true;
  }

  return {
    target: "codex",
    success: true,
    hookConfigured,
    skillInstalled,
    filesModified,
  };
}

/**
 * Setup Google Antigravity CLI (agy) plugin, hooks, and fallback skill
 */
export function setupAntigravity(options: SetupOptions = {}): SetupResult {
  const repoDir = getRepoDir(options.repoDir);
  const homeDir = getHomeDir(options.homeDir);
  const filesModified: string[] = [];
  let hookConfigured = false;
  let skillInstalled = false;
  let pluginConfigured = false;

  const hookScript = path.join(repoDir, "hooks", "antigravity.ts");
  const geminiConfigDir = path.join(homeDir, ".gemini", "config");
  const pluginDestDir = path.join(geminiConfigDir, "plugins", "jev-skill-selector");

  // 1. Install Plugin Spec & Hooks Config
  if (!options.skillOnly) {
    if (!options.dryRun) {
      fs.mkdirSync(pluginDestDir, { recursive: true });

      // plugin.json
      const pluginJson = { name: "jev-skill-selector" };
      fs.writeFileSync(
        path.join(pluginDestDir, "plugin.json"),
        JSON.stringify(pluginJson, null, 2) + "\n"
      );

      // hooks.json with dynamic repo script path
      const hooksJson = {
        "jev-skill-selector": {
          PreInvocation: [
            {
              type: "command",
              command: `bun run ${hookScript}`,
              timeout: 30,
            },
          ],
        },
      };
      fs.writeFileSync(
        path.join(pluginDestDir, "hooks.json"),
        JSON.stringify(hooksJson, null, 2) + "\n"
      );

      // Point skills.json to skills bank (~/.agents/jev_skills)
      const skillsJsonPath = path.join(geminiConfigDir, "skills.json");
      const skillsBankDir = path.join(homeDir, ".agents", "jev_skills");
      fs.mkdirSync(skillsBankDir, { recursive: true });
      fs.writeFileSync(
        skillsJsonPath,
        JSON.stringify({ entries: [{ path: skillsBankDir }] }, null, 2) + "\n"
      );
      filesModified.push(skillsJsonPath);

      // If 'agy' CLI command is available, register plugin
      try {
        execSync(`agy plugin install "${pluginDestDir}" 2>/dev/null`, { stdio: "ignore" });
      } catch {
        // agy CLI registration is optional if files are placed in ~/.gemini/config/plugins
      }
    }

    filesModified.push(pluginDestDir);
    hookConfigured = true;
    pluginConfigured = true;
  }

  // 2. Install Fallback Skill in ~/.agents/skills/jev-skill-selector
  if (!options.hooksOnly) {
    const skillTarget = path.join(homeDir, ".agents", "skills", "jev-skill-selector");
    const skillMd = path.join(repoDir, "skills", "jev-skill-selector", "SKILL.md");
    const runSh = path.join(repoDir, "skills", "jev-skill-selector", "run.sh");

    if (!options.dryRun) {
      fs.mkdirSync(skillTarget, { recursive: true });
      if (fs.existsSync(skillMd)) {
        fs.copyFileSync(skillMd, path.join(skillTarget, "SKILL.md"));
      }
      if (fs.existsSync(runSh)) {
        fs.copyFileSync(runSh, path.join(skillTarget, "run.sh"));
        try { fs.chmodSync(path.join(skillTarget, "run.sh"), 0o755); } catch {}
      }
    }
    filesModified.push(skillTarget);
    skillInstalled = true;
  }

  return {
    target: "agy",
    success: true,
    hookConfigured,
    skillInstalled,
    pluginConfigured,
    filesModified,
  };
}

/**
 * Setup OpenCode plugin and skills path
 */
export function setupOpenCode(options: SetupOptions = {}): SetupResult {
  const repoDir = getRepoDir(options.repoDir);
  const homeDir = getHomeDir(options.homeDir);
  const filesModified: string[] = [];
  let hookConfigured = false;
  let skillInstalled = false;
  let pluginConfigured = false;

  const pluginSource = path.join(repoDir, "plugins", "opencode.ts");
  const opencodeDir = path.join(homeDir, ".config", "opencode");
  const pluginDestDir = path.join(opencodeDir, "plugin");
  const pluginDest = path.join(pluginDestDir, "jev-skill-selector.ts");
  const skillsBank = path.join(homeDir, ".agents", "jev_skills");

  if (!options.skillOnly) {
    if (!options.dryRun) {
      fs.mkdirSync(pluginDestDir, { recursive: true });
      if (fs.existsSync(pluginSource)) {
        fs.copyFileSync(pluginSource, pluginDest);
        filesModified.push(pluginDest);
      }

      // Configure ~/.config/opencode/opencode.json if present
      const configPath = path.join(opencodeDir, "opencode.json");
      let data: any = {};
      if (fs.existsSync(configPath)) {
        try {
          data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        } catch {
          data = {};
        }
      }
      data.skills ??= {};
      data.skills.paths = Array.from(new Set([...(data.skills.paths || []), skillsBank]));
      data.plugin = Array.isArray(data.plugin) ? data.plugin : [];
      if (!data.plugin.includes(pluginDest)) {
        data.plugin.push(pluginDest);
      }
      fs.writeFileSync(configPath, JSON.stringify(data, null, 2) + "\n");
      filesModified.push(configPath);
    } else {
      filesModified.push(pluginDest);
    }
    hookConfigured = true;
    pluginConfigured = true;
  }

  // Fallback skill
  if (!options.hooksOnly) {
    const skillTarget = path.join(opencodeDir, "skills", "jev-skill-selector");
    const skillMd = path.join(repoDir, "skills", "jev-skill-selector", "SKILL.md");
    const runSh = path.join(repoDir, "skills", "jev-skill-selector", "run.sh");

    if (!options.dryRun) {
      fs.mkdirSync(skillTarget, { recursive: true });
      if (fs.existsSync(skillMd)) {
        fs.copyFileSync(skillMd, path.join(skillTarget, "SKILL.md"));
      }
      if (fs.existsSync(runSh)) {
        fs.copyFileSync(runSh, path.join(skillTarget, "run.sh"));
        try { fs.chmodSync(path.join(skillTarget, "run.sh"), 0o755); } catch {}
      }
    }
    filesModified.push(skillTarget);
    skillInstalled = true;
  }

  return {
    target: "opencode",
    success: true,
    hookConfigured,
    skillInstalled,
    pluginConfigured,
    filesModified,
  };
}

/**
 * Setup All supported agent harnesses and link CLI globally
 */
export function setupAll(options: SetupOptions = {}): SetupResult[] {
  const repoDir = getRepoDir(options.repoDir);
  const homeDir = getHomeDir(options.homeDir);

  // 1. Ensure central skills bank exists
  const bankDir = path.join(homeDir, ".agents", "jev_skills");
  const bankSkill = path.join(bankDir, "jev-skill-selector");
  const skillMd = path.join(repoDir, "skills", "jev-skill-selector", "SKILL.md");
  const runSh = path.join(repoDir, "skills", "jev-skill-selector", "run.sh");

  if (!options.dryRun) {
    fs.mkdirSync(bankSkill, { recursive: true });
    if (fs.existsSync(skillMd)) {
      fs.copyFileSync(skillMd, path.join(bankSkill, "SKILL.md"));
    }
    if (fs.existsSync(runSh)) {
      fs.copyFileSync(runSh, path.join(bankSkill, "run.sh"));
      try { fs.chmodSync(path.join(bankSkill, "run.sh"), 0o755); } catch {}
    }

    // 2. Link binary globally
    try {
      execSync("bun link", { cwd: repoDir, stdio: "ignore" });
    } catch {}

    // 3. Ensure .env exists
    const envFile = path.join(repoDir, ".env");
    const envExample = path.join(repoDir, ".env.example");
    if (!fs.existsSync(envFile) && fs.existsSync(envExample)) {
      fs.copyFileSync(envExample, envFile);
      try { fs.chmodSync(envFile, 0o600); } catch {}
    }
  }

  return [
    setupClaude(options),
    setupCodex(options),
    setupAntigravity(options),
    setupOpenCode(options),
  ];
}

/**
 * Inspect live status of all agent harness configurations
 */
export function checkAgentStatus(options: SetupOptions = {}): Record<string, { hook: boolean; skill: boolean }> {
  const repoDir = getRepoDir(options.repoDir);
  const homeDir = getHomeDir(options.homeDir);

  // Claude status
  let claudeHook = false;
  const claudeSettings = path.join(homeDir, ".claude", "settings.json");
  if (fs.existsSync(claudeSettings)) {
    try {
      const data = JSON.parse(fs.readFileSync(claudeSettings, "utf-8"));
      claudeHook = JSON.stringify(data).includes("hooks/claude.ts");
    } catch {}
  }
  const claudeSkill = fs.existsSync(path.join(homeDir, ".claude", "skills", "jev-skill-selector", "SKILL.md"));

  // Codex status
  let codexHook = false;
  const codexHooks = path.join(homeDir, ".codex", "hooks.json");
  if (fs.existsSync(codexHooks)) {
    try {
      const data = JSON.parse(fs.readFileSync(codexHooks, "utf-8"));
      codexHook = JSON.stringify(data).includes("hooks/codex.ts");
    } catch {}
  }
  const codexSkill = fs.existsSync(path.join(homeDir, ".codex", "skills", "jev-skill-selector", "SKILL.md"));

  // Antigravity status
  const agyPlugin = fs.existsSync(path.join(homeDir, ".gemini", "config", "plugins", "jev-skill-selector", "hooks.json"));
  const agySkill = fs.existsSync(path.join(homeDir, ".agents", "skills", "jev-skill-selector", "SKILL.md"));

  // OpenCode status
  const opencodePlugin = fs.existsSync(path.join(homeDir, ".config", "opencode", "plugin", "jev-skill-selector.ts"));
  const opencodeSkill = fs.existsSync(path.join(homeDir, ".config", "opencode", "skills", "jev-skill-selector", "SKILL.md"));

  return {
    claude: { hook: claudeHook, skill: claudeSkill },
    codex: { hook: codexHook, skill: codexSkill },
    agy: { hook: agyPlugin, skill: agySkill },
    opencode: { hook: opencodePlugin, skill: opencodeSkill },
  };
}

function printUsage(): void {
  console.log(`
🚀 Jev Skill Selector: Agent Setup Command

Usage:
  bun run setup [agent] [options]
  jev-skill-selector setup [agent] [options]

Supported Agents:
  claude       Claude Code (~/.claude/settings.json hook & skill)
  codex        Codex CLI (~/.codex/hooks.json hook & skill)
  agy          Google Antigravity CLI plugin & skill (~/.gemini/config)
  opencode     OpenCode plugin & skill (~/.config/opencode)
  all          Setup all supported agents and link CLI globally (default)

Options:
  --status         Show current configuration status for all agents
  --hooks-only     Only configure lifecycle hooks (Priority 1)
  --skill-only     Only install fallback skill (Priority 2)
  --dry-run        Preview changes without modifying filesystem
  --help, -h       Show this help message

Examples:
  bun run setup                    # Setup all agents & link globally
  bun run setup claude             # Configure Claude Code hook & skill
  bun run setup agy                # Configure Antigravity CLI plugin
  bun run setup --status           # Check which agents are configured
`);
}

// CLI entry point
export function runSetupCli(args: string[] = process.argv.slice(2)): SetupResult[] | void {
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const statusMode = args.includes("--status");
  const dryRun = args.includes("--dry-run");
  const hooksOnly = args.includes("--hooks-only");
  const skillOnly = args.includes("--skill-only");

  if (statusMode) {
    const status = checkAgentStatus();
    console.log(`\n🔍 Jev Skill Selector Agent Status:\n`);
    for (const [agent, st] of Object.entries(status)) {
      const hookIcon = st.hook ? "✓ Hook active" : "✗ No hook";
      const skillIcon = st.skill ? "✓ Skill installed" : "✗ No skill";
      console.log(`  • ${agent.padEnd(12)} : ${hookIcon.padEnd(18)} | ${skillIcon}`);
    }
    console.log();
    return;
  }

  const targetArg = args.find((a) => !a.startsWith("-")) || "all";
  const options: SetupOptions = { dryRun, hooksOnly, skillOnly };

  console.log(`\n⚙️  Configuring Jev Skill Selector for: ${targetArg.toUpperCase()}`);
  if (dryRun) console.log(`   (Dry run mode: no files will be written)\n`);

  let results: SetupResult[] = [];
  switch (targetArg.toLowerCase()) {
    case "claude":
      results = [setupClaude(options)];
      break;
    case "codex":
      results = [setupCodex(options)];
      break;
    case "agy":
    case "antigravity":
      results = [setupAntigravity(options)];
      break;
    case "opencode":
      results = [setupOpenCode(options)];
      break;
    case "all":
      results = setupAll(options);
      break;
    default:
      console.error(`Unknown agent target: "${targetArg}". Use 'claude', 'codex', 'agy', 'opencode', or 'all'.`);
      if (import.meta.main) {
        process.exit(1);
      }
      throw new Error(`Unknown agent target: ${targetArg}`);
  }

  for (const res of results) {
    const hookStatus = res.hookConfigured ? "✓ Hook configured" : "- Hook skipped";
    const skillStatus = res.skillInstalled ? "✓ Skill installed" : "- Skill skipped";
    console.log(`\n📦 [${res.target.toUpperCase()}]`);
    console.log(`   • ${hookStatus}`);
    console.log(`   • ${skillStatus}`);
    if (res.filesModified.length > 0) {
      console.log(`   • Modified files:`);
      for (const f of res.filesModified) {
        console.log(`     - ${f}`);
      }
    }
  }

  console.log(`\n🎉 Setup complete for ${targetArg}!`);
  console.log(`   Restart your agent harness (Claude, Codex, Antigravity, OpenCode) to load changes.\n`);
  return results;
}

if (import.meta.main) {
  runSetupCli();
}
