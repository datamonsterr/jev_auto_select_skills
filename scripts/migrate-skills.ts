#!/usr/bin/env bun
import path from "node:path";
import os from "node:os";
import {
  rollbackMigration,
  migrateSkills,
  DEFAULT_KEEP_SKILLS,
  type MigrationOptions,
} from "../lib/migrate";

export async function runMigrateCli(
  args: string[] = process.argv.slice(2),
): Promise<void> {
  const homeDir = os.homedir();

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Safe Skill Migration Tool (migrate-skills)
Relocates optional task-specific skills into .agents/other_skills while preserving
always-on skills in native agent directories.

Usage:
  otherskill migrate [options]
  bun run scripts/migrate-skills.ts [options]

Options:
  --prefer-native     Resolve source variants using shared native, other native, then legacy precedence; all variants backed up
  --apply             Apply changes (default: preview only)
  --legacy-bank <dir> Include a canonical legacy bank (repeatable)
  --rollback <file>   Restore a verified backup manifest (supports --dry-run)
  --dry-run, -d        Preview migration actions without modifying filesystem
  --keep, -k <list>    Comma-separated list of additional skill names to keep in native dirs
  --source, -s <dir>   Source skill directory (can be specified multiple times)
  --target, -t <dir>   Target skills bank directory (default: ~/.agents/other_skills)
  --backup, -b <dir>   Custom backup directory path
  --no-repair-symlinks Do not repair symlinks pointing into legacy .agents/jev_skills
  --json               Output result as JSON
  --help, -h           Show this help message

Default Kept Skills (always preserved in native dirs):
  ${DEFAULT_KEEP_SKILLS.join(", ")}
`);
    return;
  }

  const valueFlags = new Set([
    "--keep",
    "-k",
    "--source",
    "-s",
    "--target",
    "-t",
    "--backup",
    "-b",
    "--rollback",
    "--legacy-bank",
  ]);
  const boolFlags = new Set([
    "--apply",
    "--dry-run",
    "-d",
    "--json",
    "--no-repair-symlinks",
    "--prefer-native",
  ]);
  const values = new Map<string, string[]>();
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === undefined) continue;
    if (boolFlags.has(flag)) flags.add(flag);
    else if (valueFlags.has(flag)) {
      const value = args[++i];
      if (!value || value.startsWith("-"))
        throw new Error(`${flag} requires a value`);
      values.set(flag, [...(values.get(flag) ?? []), value]);
    } else throw new Error(`Unknown migration argument: ${flag}`);
  }
  if (flags.has("--apply") && (flags.has("--dry-run") || flags.has("-d")))
    throw new Error("--apply and --dry-run are mutually exclusive");
  const dryRun = !flags.has("--apply");
  const jsonOutput = flags.has("--json");
  const repairSymlinks = !flags.has("--no-repair-symlinks");
  const all = (...names: string[]) =>
    names.flatMap((name) => values.get(name) ?? []);
  const customKeep = all("--keep", "-k").flatMap((v) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const customSources = all("--source", "-s");
  const customTarget = all("--target", "-t").at(-1);
  const customBackup = all("--backup", "-b").at(-1);
  const rollback = all("--rollback").at(-1);
  if (rollback) {
    console.log(JSON.stringify(await rollbackMigration(rollback, { dryRun })));
    return;
  }

  const defaultSources = [
    path.join(homeDir, ".agents", "jev_skills"),
    path.join(homeDir, ".agents", "skills"),
    path.join(homeDir, ".claude", "skills"),
    path.join(homeDir, ".codex", "skills"),
    path.join(homeDir, ".gemini", "config", "skills"),
    path.join(homeDir, ".config", "opencode", "skills"),
  ];

  const sourceDirs = customSources.length > 0 ? customSources : defaultSources;
  const targetDir =
    customTarget || path.join(homeDir, ".agents", "other_skills");

  const options: MigrationOptions = {
    sourceDirs,
    targetDir,
    backupDir: customBackup || undefined,
    keepSkills: customKeep,
    dryRun,
    repairSymlinks,
    conflictPolicy: flags.has("--prefer-native") ? "prefer-native" : "error",
    legacyBankPaths: [
      ...(customSources.length
        ? []
        : [path.join(homeDir, ".agents", "jev_skills")]),
      ...all("--legacy-bank"),
    ],
  };

  if (!jsonOutput) {
    console.log(`\n📦 Safe Skill Migration`);
    console.log(`Target Bank: ${targetDir}`);
    if (dryRun) console.log(`Mode: DRY RUN (no files will be changed)\n`);
    else console.log(`Mode: LIVE EXECUTION\n`);
  }

  const result = await migrateSkills(options);

  if (result.collisions.length) process.exitCode = 1;

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Summary:`);
  console.log(`  • Kept in native dirs:    ${result.kept.length} skills`);
  if (result.kept.length > 0) {
    console.log(`    (${result.kept.join(", ")})`);
  }
  console.log(`  • Moved to other_skills:  ${result.moved.length} skills`);
  if (result.moved.length > 0) {
    console.log(`    (${result.moved.join(", ")})`);
  }
  console.log(`  • Collisions prevented:   ${result.collisions.length}`);
  if (result.collisions.length > 0) {
    console.log(`    (${result.collisions.join(", ")})`);
  }
  console.log(`  • Already at destination: ${result.skipped.length}`);
  console.log(`  • Repaired symlinks:      ${result.repairedSymlinks.length}`);
  if (result.manifestPath) {
    console.log(`\nManifest saved to: ${result.manifestPath}`);
  }
  console.log(
    result.collisions.length
      ? "Migration blocked: collisions; no changes applied."
      : "Migration complete.",
  );
}

if (import.meta.main) {
  runMigrateCli();
}
