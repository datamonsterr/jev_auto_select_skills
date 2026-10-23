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
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-setup-test-"));
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
    expect(JSON.stringify(settings)).toContain("'find' '--agent' 'claude'");

    const skillTarget = path.join(
      tmpHome,
      ".claude",
      "skills",
      "use-otherskill",
    );
    expect(fs.existsSync(path.join(skillTarget, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillTarget, "run.sh"))).toBe(false);

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
    const hooksOnlyHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "otherskill-hooks-only-"),
    );
    try {
      const hRes = setupClaude({
        homeDir: hooksOnlyHome,
        repoDir,
        hooksOnly: true,
      });
      expect(hRes.hookConfigured).toBe(true);
      expect(hRes.skillInstalled).toBe(false);
      expect(
        fs.existsSync(path.join(hooksOnlyHome, ".claude", "settings.json")),
      ).toBe(true);
      expect(fs.existsSync(path.join(hooksOnlyHome, ".claude", "skills"))).toBe(
        false,
      );

      const skillOnlyHome = fs.mkdtempSync(
        path.join(os.tmpdir(), "otherskill-skill-only-"),
      );
      try {
        const sRes = setupClaude({
          homeDir: skillOnlyHome,
          repoDir,
          skillOnly: true,
        });
        expect(sRes.hookConfigured).toBe(false);
        expect(sRes.skillInstalled).toBe(true);
        expect(
          fs.existsSync(path.join(skillOnlyHome, ".claude", "settings.json")),
        ).toBe(false);
        expect(
          fs.existsSync(
            path.join(
              skillOnlyHome,
              ".claude",
              "skills",
              "use-otherskill",
              "SKILL.md",
            ),
          ),
        ).toBe(true);
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
    expect(JSON.stringify(hooksData)).toContain("'find' '--agent' 'codex'");

    const skillTarget = path.join(
      tmpHome,
      ".agents",
      "skills",
      "use-otherskill",
    );
    expect(fs.existsSync(path.join(skillTarget, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillTarget, "run.sh"))).toBe(false);

    // 3. Status reflects configured state
    const status = checkAgentStatus({ homeDir: tmpHome, repoDir });
    expect(status.codex.hook).toBe(true);
    expect(status.codex.skill).toBe(true);
  });

  it("setupAntigravity configures native PreInvocation hook without exposing a skills bank", () => {
    const res = setupAntigravity({ homeDir: tmpHome, repoDir });
    expect(res.success).toBe(true);
    const hook = path.join(tmpHome, ".gemini/config/hooks.json");
    expect(
      JSON.parse(fs.readFileSync(hook, "utf8")).otherskill.PreInvocation,
    ).toHaveLength(1);
    expect(fs.readFileSync(hook, "utf8")).toContain(
      "'find' '--agent' 'antigravity'",
    );
    expect(
      fs.existsSync(path.join(tmpHome, ".gemini/config/skills.json")),
    ).toBe(false);
    expect(checkAgentStatus({ homeDir: tmpHome }).agy).toEqual({
      hook: true,
      skill: true,
    });
  });

  it("setupOpenCode uses native plugin auto-discovery and shared companion without skills.paths exposure", () => {
    expect(setupOpenCode({ homeDir: tmpHome, repoDir }).success).toBe(true);
    const plugin = path.join(tmpHome, ".config/opencode/plugins/otherskill.ts");
    expect(fs.readFileSync(plugin, "utf8")).toContain(
      '"find","--agent","opencode"',
    );
    expect(
      fs.existsSync(path.join(tmpHome, ".config/opencode/opencode.json")),
    ).toBe(false);
    expect(checkAgentStatus({ homeDir: tmpHome }).opencode).toEqual({
      hook: true,
      skill: true,
    });
  });

  it("setupAll configures all agents without copying a categorized bank natively", () => {
    const results = setupAll({ homeDir: tmpHome, repoDir });
    expect(results).toHaveLength(4);
    expect(results.every((r) => r.success)).toBe(true);
    expect(fs.existsSync(path.join(tmpHome, ".agents/jev_skills"))).toBe(false);
    const status = checkAgentStatus({ homeDir: tmpHome });
    for (const agent of Object.values(status))
      expect(agent).toEqual({ hook: true, skill: true });
  });

  it("runSetupCli handles CLI arguments cleanly", () => {
    // --status
    const statusRes = runSetupCli(["--status", "--home", tmpHome]);
    expect(statusRes).toBeUndefined();

    // specific agent with --dry-run
    const claudeRes = runSetupCli(["claude", "--dry-run", "--home", tmpHome]);
    expect(Array.isArray(claudeRes)).toBe(true);
    expect(claudeRes?.[0]?.target).toBe("claude");

    // --help
    const helpRes = runSetupCli(["--help"]);
    expect(helpRes).toBeUndefined();

    // unknown agent throws
    expect(() => runSetupCli(["unknown-agent"])).toThrow(
      "Unknown agent target",
    );
  });
});

it("setup does not activate other account homes, stage migration skills or change existing CLI links", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-no-cutover-"));
  try {
    const account = path.join(
      home,
      ".omnigent/accounts/account1/.gemini/config",
    );
    fs.mkdirSync(account, { recursive: true });
    fs.writeFileSync(path.join(account, "hooks.json"), "existing account hook");
    const bin = path.join(home, ".bun/bin");
    fs.mkdirSync(bin, { recursive: true });
    fs.symlinkSync("/unchanged/legacy-cli", path.join(bin, "skill_selector"));
    setupAll({ homeDir: home });
    expect(fs.readFileSync(path.join(account, "hooks.json"), "utf8")).toBe(
      "existing account hook",
    );
    expect(fs.readlinkSync(path.join(bin, "skill_selector"))).toBe(
      "/unchanged/legacy-cli",
    );
    expect(
      fs.existsSync(path.join(home, ".agents/other_skills/migrate-skill")),
    ).toBe(false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
