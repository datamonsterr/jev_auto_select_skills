import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveSkillsSearchPaths, loadSkillsFromDir } from "../index";

describe("Skills Bank discovery and search precedence", () => {
  const origEnv = { ...process.env };
  const tempDir = path.join(os.tmpdir(), `discovery-test-${Date.now()}`);

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.SKILLS_BANK_PATH;
    delete process.env.SKILL_SELECTOR_BANK_PATH;
    delete process.env.OTHERSKILL_BANK_PATH;
    delete process.env.SKILL_SELECTOR_GLOBAL_SKILLS_PATH;
    delete process.env.OTHERSKILL_GLOBAL_SKILLS_PATH;
    delete process.env.SKILL_SELECTOR_AGENT_SKILLS_PATH;
    delete process.env.OTHERSKILL_AGENT_SKILLS_PATH;
    delete process.env.GLOBAL_SKILLS_PATH;
    delete process.env.AGENT_SKILLS_PATH;
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    process.env = { ...origEnv };
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("prioritizes project skills over global even when global SKILLS_BANK_PATH is set", () => {
    const projectDir = path.join(tempDir, "workspace");
    const projectOtherSkills = path.join(projectDir, ".agents", "other_skills");
    const globalBank = path.join(tempDir, "global_bank");

    fs.mkdirSync(projectOtherSkills, { recursive: true });
    fs.mkdirSync(globalBank, { recursive: true });

    // Set SKILLS_BANK_PATH to global directory
    process.env.SKILLS_BANK_PATH = globalBank;

    const paths = resolveSkillsSearchPaths({ cwd: projectDir });

    // Project skills must come before global bank in search paths
    expect(paths.length).toBeGreaterThan(0);
    const realProject = fs.realpathSync(projectOtherSkills);
    const resolvedFirst = fs.realpathSync(paths[0] ?? "");
    expect(resolvedFirst).toBe(realProject);
  });

  it("OTHERSKILL_* env names win over legacy SKILL_SELECTOR_* and legacy still works", () => {
    const cwd = path.join(tempDir, "envcwd");
    fs.mkdirSync(cwd, { recursive: true });
    const names = ["BANK_PATH", "GLOBAL_SKILLS_PATH", "AGENT_SKILLS_PATH"];
    for (const n of names) {
      const newDir = path.join(tempDir, `new_${n}`);
      const oldDir = path.join(tempDir, `old_${n}`);
      fs.mkdirSync(newDir, { recursive: true });
      fs.mkdirSync(oldDir, { recursive: true });
      process.env[`OTHERSKILL_${n}`] = newDir;
      process.env[`SKILL_SELECTOR_${n}`] = oldDir;
      const both = resolveSkillsSearchPaths({ cwd }).map((p) =>
        path.resolve(p),
      );
      expect(both).toContain(path.resolve(newDir));
      expect(both).not.toContain(path.resolve(oldDir));

      delete process.env[`OTHERSKILL_${n}`];
      const legacy = resolveSkillsSearchPaths({ cwd }).map((p) =>
        path.resolve(p),
      );
      expect(legacy).toContain(path.resolve(oldDir));
      delete process.env[`SKILL_SELECTOR_${n}`];
    }
  });

  it("finds nearest workspace ancestor discovery for nested cwd", () => {
    const projectDir = path.join(tempDir, "monorepo");
    const projectOtherSkills = path.join(projectDir, ".agents", "other_skills");
    const nestedCwd = path.join(projectDir, "packages", "service", "src");

    fs.mkdirSync(projectOtherSkills, { recursive: true });
    fs.mkdirSync(nestedCwd, { recursive: true });

    const paths = resolveSkillsSearchPaths({ cwd: nestedCwd });

    expect(paths.length).toBeGreaterThan(0);
    const realProject = fs.realpathSync(projectOtherSkills);
    const resolvedFirst = fs.realpathSync(paths[0] ?? "");
    expect(resolvedFirst).toBe(realProject);
  });

  it("deduplicates search paths using realpath", () => {
    const projectDir = path.join(tempDir, "symlink-workspace");
    const actualBank = path.join(projectDir, ".agents", "other_skills");
    fs.mkdirSync(actualBank, { recursive: true });

    const symlinkBank = path.join(projectDir, "symlinked-bank");
    fs.symlinkSync(actualBank, symlinkBank, "dir");

    const paths = resolveSkillsSearchPaths({
      skillsDir: [actualBank, symlinkBank],
      cwd: projectDir,
    });

    const realpaths = paths.map((p) => {
      try {
        return fs.realpathSync(p);
      } catch {
        return p;
      }
    });
    const uniqueRealpaths = new Set(realpaths);
    expect(uniqueRealpaths.size).toBe(paths.length);
  });

  it("loads skills from symlinked directories and ignores broken symlinks gracefully", () => {
    const bankDir = path.join(tempDir, "bank_with_symlinks");
    const realSkillDir = path.join(tempDir, "real_tdd_skill");
    fs.mkdirSync(bankDir, { recursive: true });
    fs.mkdirSync(realSkillDir, { recursive: true });

    fs.writeFileSync(
      path.join(realSkillDir, "SKILL.md"),
      "---\nname: tdd\ndescription: Test-driven development\n---\n# TDD",
    );

    // Valid symlink to a skill directory
    fs.symlinkSync(realSkillDir, path.join(bankDir, "tdd-symlink"), "dir");

    // Broken symlink pointing to non-existent location
    fs.symlinkSync(
      path.join(tempDir, "non_existent"),
      path.join(bankDir, "broken-symlink"),
      "dir",
    );

    // Should load the symlinked skill and NOT crash on the broken symlink
    const skills = loadSkillsFromDir(bankDir);
    expect(skills.some((s) => s.name === "tdd")).toBe(true);
  });

  it("supports backward-compatible legacy .agents/jev_skills when .agents/other_skills absent", () => {
    const projectDir = path.join(tempDir, "legacy-workspace");
    const legacyBank = path.join(projectDir, ".agents", "jev_skills");
    fs.mkdirSync(legacyBank, { recursive: true });

    const paths = resolveSkillsSearchPaths({ cwd: projectDir });
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.includes("jev_skills"))).toBe(true);
  });
});
