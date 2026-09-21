import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { dirnameCompat } from "../lib/compat";
import {
  setupClaude,
  setupCodex,
  setupAntigravity,
  setupOpenCode,
  setupAll,
  checkAgentStatus,
  runSetupCli,
} from "../scripts/setup-agent";

describe("agent setup scripts", () => {
  let tmpHome: string;
  let repoDir: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "jev-setup-test-"));
    repoDir = path.resolve(dirnameCompat(import.meta), "..");
  });

  afterEach(() => {
    if (fs.existsSync(tmpHome)) {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  it("checkAgentStatus inspects directory configurations accurately", () => {
    // In empty tmpHome, everything should report false
    const initialStatus = checkAgentStatus({ homeDir: tmpHome, repoDir });
    expect(initialStatus.claude.hook).toBe(false);
    expect(initialStatus.claude.skill).toBe(false);
    expect(initialStatus.codex.hook).toBe(false);
    expect(initialStatus.codex.skill).toBe(false);
    expect(initialStatus.agy.hook).toBe(false);
    expect(initialStatus.agy.skill).toBe(false);
    expect(initialStatus.opencode.hook).toBe(false);
    expect(initialStatus.opencode.skill).toBe(false);
  });

  it("setupClaude configures hook and installs skill", () => {
    // 1. Dry run creates nothing
    const dryRes = setupClaude({ homeDir: tmpHome, repoDir, dryRun: true });
    expect(dryRes.success).toBe(true);
    expect(dryRes.hookConfigured).toBe(true);
    expect(dryRes.skillInstalled).toBe(true);
    expect(fs.existsSync(path.join(tmpHome, ".claude"))).toBe(false);

    // 2. Real setup creates files
    const res = setupClaude({ homeDir: tmpHome, repoDir, dryRun: false });
    expect(res.success).toBe(true);

    const settingsPath = path.join(tmpHome, ".claude", "settings.json");
    expect(fs.existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(settings.hooks.UserPromptSubmit).toBeDefined();
    expect(JSON.stringify(settings)).toContain("hooks/claude.ts");

    const skillTarget = path.join(tmpHome, ".claude", "skills", "jev-skill-selector");
    expect(fs.existsSync(path.join(skillTarget, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillTarget, "run.sh"))).toBe(true);

    // 3. Idempotent execution doesn't duplicate hooks
    setupClaude({ homeDir: tmpHome, repoDir, dryRun: false });
    const settings2 = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(settings2.hooks.UserPromptSubmit.length).toBe(1);

    // 4. Status reflects configured state
    const status = checkAgentStatus({ homeDir: tmpHome, repoDir });
    expect(status.claude.hook).toBe(true);
    expect(status.claude.skill).toBe(true);
  });

  it("setupClaude supports hooksOnly and skillOnly flags", () => {
    const hooksOnlyHome = fs.mkdtempSync(path.join(os.tmpdir(), "jev-hooks-only-"));
    try {
      const hRes = setupClaude({ homeDir: hooksOnlyHome, repoDir, hooksOnly: true });
      expect(hRes.hookConfigured).toBe(true);
      expect(hRes.skillInstalled).toBe(false);
      expect(fs.existsSync(path.join(hooksOnlyHome, ".claude", "settings.json"))).toBe(true);
      expect(fs.existsSync(path.join(hooksOnlyHome, ".claude", "skills"))).toBe(false);

      const skillOnlyHome = fs.mkdtempSync(path.join(os.tmpdir(), "jev-skill-only-"));
      try {
        const sRes = setupClaude({ homeDir: skillOnlyHome, repoDir, skillOnly: true });
        expect(sRes.hookConfigured).toBe(false);
        expect(sRes.skillInstalled).toBe(true);
        expect(fs.existsSync(path.join(skillOnlyHome, ".claude", "settings.json"))).toBe(false);
        expect(fs.existsSync(path.join(skillOnlyHome, ".claude", "skills", "jev-skill-selector", "SKILL.md"))).toBe(true);
      } finally {
        fs.rmSync(skillOnlyHome, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(hooksOnlyHome, { recursive: true, force: true });
    }
  });

  it("setupCodex configures hook and installs skill", () => {
    // 1. Dry run creates nothing
    const dryRes = setupCodex({ homeDir: tmpHome, repoDir, dryRun: true });
    expect(dryRes.success).toBe(true);
    expect(fs.existsSync(path.join(tmpHome, ".codex"))).toBe(false);

    // 2. Real setup
    const res = setupCodex({ homeDir: tmpHome, repoDir, dryRun: false });
    expect(res.success).toBe(true);

    const hooksPath = path.join(tmpHome, ".codex", "hooks.json");
    expect(fs.existsSync(hooksPath)).toBe(true);
    const hooksData = JSON.parse(fs.readFileSync(hooksPath, "utf-8"));
    expect(hooksData.hooks.UserPromptSubmit).toBeDefined();
    expect(JSON.stringify(hooksData)).toContain("hooks/codex.ts");

    const skillTarget = path.join(tmpHome, ".codex", "skills", "jev-skill-selector");
    expect(fs.existsSync(path.join(skillTarget, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillTarget, "run.sh"))).toBe(true);

    // 3. Status reflects configured state
    const status = checkAgentStatus({ homeDir: tmpHome, repoDir });
    expect(status.codex.hook).toBe(true);
    expect(status.codex.skill).toBe(true);
  });

  it("setupAntigravity configures plugins, hooks and skill bank", () => {
    const res = setupAntigravity({ homeDir: tmpHome, repoDir, dryRun: false });
    expect(res.success).toBe(true);
    expect(res.pluginConfigured).toBe(true);

    const pluginDir = path.join(tmpHome, ".gemini", "config", "plugins", "jev-skill-selector");
    expect(fs.existsSync(path.join(pluginDir, "plugin.json"))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, "hooks.json"))).toBe(true);

    const hooksContent = JSON.parse(fs.readFileSync(path.join(pluginDir, "hooks.json"), "utf-8"));
    expect(JSON.stringify(hooksContent)).toContain("hooks/antigravity.ts");

    const skillsJson = path.join(tmpHome, ".gemini", "config", "skills.json");
    expect(fs.existsSync(skillsJson)).toBe(true);

    const fallbackSkill = path.join(tmpHome, ".agents", "skills", "jev-skill-selector", "SKILL.md");
    expect(fs.existsSync(fallbackSkill)).toBe(true);

    const status = checkAgentStatus({ homeDir: tmpHome, repoDir });
    expect(status.agy.hook).toBe(true);
    expect(status.agy.skill).toBe(true);
  });

  it("setupOpenCode configures plugin and skills path", () => {
    const res = setupOpenCode({ homeDir: tmpHome, repoDir, dryRun: false });
    expect(res.success).toBe(true);

    const pluginPath = path.join(tmpHome, ".config", "opencode", "plugin", "jev-skill-selector.ts");
    expect(fs.existsSync(pluginPath)).toBe(true);

    const configPath = path.join(tmpHome, ".config", "opencode", "opencode.json");
    expect(fs.existsSync(configPath)).toBe(true);
    const configData = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(configData.skills.paths).toContain(path.join(tmpHome, ".agents", "jev_skills"));
    expect(configData.plugin).toContain(pluginPath);

    const fallbackSkill = path.join(tmpHome, ".config", "opencode", "skills", "jev-skill-selector", "SKILL.md");
    expect(fs.existsSync(fallbackSkill)).toBe(true);

    const status = checkAgentStatus({ homeDir: tmpHome, repoDir });
    expect(status.opencode.hook).toBe(true);
    expect(status.opencode.skill).toBe(true);
  });

  it("setupAll configures all agents and central bank", () => {
    const results = setupAll({ homeDir: tmpHome, repoDir, dryRun: false });
    expect(results.length).toBe(4);
    expect(results.every((r) => r.success)).toBe(true);

    // Central bank should contain jev-skill-selector
    const bankSkill = path.join(tmpHome, ".agents", "jev_skills", "jev-skill-selector", "SKILL.md");
    expect(fs.existsSync(bankSkill)).toBe(true);

    const status = checkAgentStatus({ homeDir: tmpHome, repoDir });
    expect(status.claude.hook).toBe(true);
    expect(status.codex.hook).toBe(true);
    expect(status.agy.hook).toBe(true);
    expect(status.opencode.hook).toBe(true);
  });

  it("runSetupCli handles CLI arguments cleanly", () => {
    // --status
    const statusRes = runSetupCli(["--status"]);
    expect(statusRes).toBeUndefined();

    // specific agent with --dry-run
    const claudeRes = runSetupCli(["claude", "--dry-run"]);
    expect(Array.isArray(claudeRes)).toBe(true);
    expect(claudeRes?.[0]?.target).toBe("claude");

    // --help
    const helpRes = runSetupCli(["--help"]);
    expect(helpRes).toBeUndefined();

    // unknown agent throws
    expect(() => runSetupCli(["unknown-agent"])).toThrow("Unknown agent target");
  });
});
