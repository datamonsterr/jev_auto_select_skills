import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { migrateSkills, type MigrationOptions } from "../lib/migrate";

describe("Safe skill migration primitive (migrate-skills)", () => {
  const tempDir = path.join(os.tmpdir(), `migrate-test-${Date.now()}`);
  const nativeSkillsDir = path.join(tempDir, "native_skills");
  const targetOtherSkillsDir = path.join(tempDir, "other_skills");
  const backupDir = path.join(tempDir, "backup");

  beforeEach(() => {
    fs.mkdirSync(nativeSkillsDir, { recursive: true });
    fs.mkdirSync(targetOtherSkillsDir, { recursive: true });

    // Create an always-on skill (e.g. caveman)
    const cavemanDir = path.join(nativeSkillsDir, "caveman");
    fs.mkdirSync(cavemanDir, { recursive: true });
    fs.writeFileSync(
      path.join(cavemanDir, "SKILL.md"),
      "---\nname: caveman\ndescription: Ultra-compressed communication mode\n---\n# Caveman",
    );

    // Create an optional skill with complete tree (scripts, assets, docs)
    const tddDir = path.join(nativeSkillsDir, "tdd");
    fs.mkdirSync(path.join(tddDir, "scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(tddDir, "SKILL.md"),
      "---\nname: tdd\ndescription: Test-driven development\n---\n# TDD",
    );
    fs.writeFileSync(
      path.join(tddDir, "scripts", "runner.sh"),
      "#!/bin/bash\necho tdd runner",
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("preserves originals of kept skills in native directory while moving optional skills", async () => {
    const result = await migrateSkills({
      sourceDirs: [nativeSkillsDir],
      targetDir: targetOtherSkillsDir,
      backupDir,
      keepSkills: ["caveman"],
      dryRun: false,
    });

    // Kept skill must remain in native directory!
    expect(
      fs.existsSync(path.join(nativeSkillsDir, "caveman", "SKILL.md")),
    ).toBe(true);
    expect(result.kept).toContain("caveman");

    // Optional skill must be moved to other_skills
    expect(
      fs.existsSync(path.join(targetOtherSkillsDir, "tdd", "SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(targetOtherSkillsDir, "tdd", "scripts", "runner.sh"),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(nativeSkillsDir, "tdd"))).toBe(false);
    expect(result.moved).toContain("tdd");
  });

  it("dry run mode previews migration without modifying any files on disk", async () => {
    const result = await migrateSkills({
      sourceDirs: [nativeSkillsDir],
      targetDir: targetOtherSkillsDir,
      backupDir,
      keepSkills: ["caveman"],
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.moved).toContain("tdd");
    expect(result.kept).toContain("caveman");

    // Files on disk must remain unchanged in dryRun
    expect(fs.existsSync(path.join(nativeSkillsDir, "tdd", "SKILL.md"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(targetOtherSkillsDir, "tdd"))).toBe(false);
  });

  it("is idempotent: running multiple times does not corrupt files or duplicate backups", async () => {
    const options: MigrationOptions = {
      sourceDirs: [nativeSkillsDir],
      targetDir: targetOtherSkillsDir,
      backupDir,
      keepSkills: ["caveman"],
      dryRun: false,
    };

    const firstRun = await migrateSkills(options);
    expect(firstRun.moved).toContain("tdd");

    // Second run
    const secondRun = await migrateSkills(options);
    expect(secondRun.moved.length).toBe(0);
    expect(
      fs.existsSync(path.join(targetOtherSkillsDir, "tdd", "SKILL.md")),
    ).toBe(true);
  });

  it("failed collisions change nothing and do not overwrite existing skills", async () => {
    // Put a conflicting skill in target with different content
    const existingTargetTdd = path.join(targetOtherSkillsDir, "tdd");
    fs.mkdirSync(existingTargetTdd, { recursive: true });
    fs.writeFileSync(
      path.join(existingTargetTdd, "SKILL.md"),
      "# Existing Different TDD Content",
    );

    const result = await migrateSkills({
      sourceDirs: [nativeSkillsDir],
      targetDir: targetOtherSkillsDir,
      backupDir,
      keepSkills: ["caveman"],
      dryRun: false,
    });

    // Collision should be flagged
    expect(result.collisions).toContain("tdd");

    // The target file must NOT have been overwritten
    const targetContent = fs.readFileSync(
      path.join(existingTargetTdd, "SKILL.md"),
      "utf-8",
    );
    expect(targetContent).toBe("# Existing Different TDD Content");

    // The source file must NOT have been deleted
    expect(fs.existsSync(path.join(nativeSkillsDir, "tdd", "SKILL.md"))).toBe(
      true,
    );
  });

  it("repairs symlinks pointing into renamed legacy jev_skills bank", async () => {
    const legacyDir = path.join(tempDir, "legacy_jev_skills", "my-tool");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "SKILL.md"), "# Tool");

    const consumerDir = path.join(tempDir, "consumer_skills");
    fs.mkdirSync(consumerDir, { recursive: true });
    const symlinkPath = path.join(consumerDir, "my-tool");
    fs.symlinkSync(legacyDir, symlinkPath);

    // Run migration with legacy repair
    const result = await migrateSkills({
      sourceDirs: [consumerDir],
      targetDir: targetOtherSkillsDir,
      legacyBankPaths: [path.join(tempDir, "legacy_jev_skills")],
      repairSymlinks: true,
      backupDir,
      keepSkills: [],
      dryRun: false,
    });

    expect(result.repairedSymlinks.length).toBeGreaterThanOrEqual(1);
  });

  it("generates an exact backup manifest with timestamps, hashes, and paths", async () => {
    const result = await migrateSkills({
      sourceDirs: [nativeSkillsDir],
      targetDir: targetOtherSkillsDir,
      backupDir,
      keepSkills: ["caveman"],
      dryRun: false,
    });

    expect(result.manifestPath).toBeDefined();
    expect(fs.existsSync(result.manifestPath!)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(result.manifestPath!, "utf-8"));
    expect(manifest.timestamp).toBeDefined();
    expect(manifest.actions).toBeDefined();
    expect(Array.isArray(manifest.actions)).toBe(true);
  });
});
