import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runMigrateCli } from "../scripts/migrate-skills";
describe("migration CLI write gate", () => {
  it("rejects unknown flags and missing values before mutation", async () => {
    await expect(runMigrateCli(["--apply", "--wat"])).rejects.toThrow(
      "Unknown",
    );
    await expect(runMigrateCli(["--source"])).rejects.toThrow(
      "requires a value",
    );
    await expect(runMigrateCli(["--apply", "--dry-run"])).rejects.toThrow(
      "mutually exclusive",
    );
  });
  it("previews by default, migrates complete project bank and native links only on apply, previews rollback", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "selector-cli-"));
    try {
      const source = path.join(root, "native"),
        legacy = path.join(root, "jev_skills"),
        target = path.join(root, "other_skills"),
        backup = path.join(root, "backup");
      fs.mkdirSync(source);
      fs.mkdirSync(path.join(legacy, "tdd"), { recursive: true });
      fs.writeFileSync(path.join(legacy, "tdd/SKILL.md"), "# TDD");
      fs.writeFileSync(path.join(legacy, "tdd/run.sh"), "asset");
      fs.symlinkSync(path.join(legacy, "tdd"), path.join(source, "tdd"));
      const args = [
        "--source",
        source,
        "--legacy-bank",
        legacy,
        "--target",
        target,
        "--backup",
        backup,
        "--json",
      ];
      await runMigrateCli(args);
      expect(fs.existsSync(target)).toBe(false);
      await runMigrateCli([...args, "--apply"]);
      expect(fs.readFileSync(path.join(target, "tdd/run.sh"), "utf8")).toBe(
        "asset",
      );
      expect(fs.readdirSync(source)).toHaveLength(0);
      const manifest = path.join(backup, "backup_manifest.json");
      await runMigrateCli(["--rollback", manifest]);
      expect(fs.readdirSync(source)).toHaveLength(0);
      await runMigrateCli(["--rollback", manifest, "--apply"]);
      expect(fs.readFileSync(path.join(source, "tdd/run.sh"), "utf8")).toBe(
        "asset",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
