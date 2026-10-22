import { it, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { retireLegacySkills } from "../scripts/retire-legacy-skills";
import { rollbackMigration } from "../lib/migrate";
it("retires only legacy names after replacement, exact backup and reversible private archive", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "selector-retire-"));
  try {
    const native = path.join(root, "native"),
      replacement = path.join(native, "skill_selector/SKILL.md"),
      backupDir = path.join(root, "private");
    for (const name of [
      "skill_selector",
      "jev-skill-selector",
      "jev-dispatch",
      "tdd",
    ]) {
      fs.mkdirSync(path.join(native, name), { recursive: true });
      fs.writeFileSync(path.join(native, name, "SKILL.md"), name);
    }
    const alias = path.join(root, "claude-skills");
    fs.symlinkSync(native, alias);
    const options = { roots: [native, alias], replacement, backupDir };
    expect((await retireLegacySkills(options)).dryRun).toBe(true);
    expect(fs.existsSync(backupDir)).toBe(false);
    const result = await retireLegacySkills({ ...options, apply: true });
    expect(fs.readdirSync(native).sort()).toEqual(["skill_selector", "tdd"]);
    expect(result.sources).toHaveLength(2);
    await rollbackMigration(result.manifestPath);
    expect(
      fs.readFileSync(path.join(native, "jev-dispatch/SKILL.md"), "utf8"),
    ).toBe("jev-dispatch");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
