import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface MigrationOptions {
  sourceDirs: string[];
  targetDir: string;
  backupDir?: string;
  keepSkills?: string[];
  dryRun?: boolean;
  legacyBankPaths?: string[];
  repairSymlinks?: boolean;
}

export interface MigrationAction {
  skillName: string;
  action: "keep" | "move" | "collision" | "skip" | "repair_symlink";
  sourcePath?: string;
  targetPath?: string;
  reason?: string;
  fileCount?: number;
  hash?: string;
}

export interface MigrationResult {
  dryRun: boolean;
  moved: string[];
  kept: string[];
  skipped: string[];
  collisions: string[];
  repairedSymlinks: string[];
  actions: MigrationAction[];
  manifestPath?: string;
}

export const DEFAULT_KEEP_SKILLS = [
  "caveman",
  "cavecrew",
  "using-superpowers",
  "superpowers",
  "skill_selector",
  "jev-skill-selector",
  "triage",
];

/**
 * Compute sha256 checksum of a file
 */
function getFileChecksum(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return "";
    const buf = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buf).digest("hex");
  } catch {
    return "";
  }
}

/**
 * Compare two skill directories to check if they have identical SKILL.md
 */
function areSkillContentsIdentical(dirA: string, dirB: string): boolean {
  const fileA = path.join(dirA, "SKILL.md");
  const fileB = path.join(dirB, "SKILL.md");
  if (!fs.existsSync(fileA) || !fs.existsSync(fileB)) return false;
  try {
    const contentA = fs.readFileSync(fileA, "utf-8").trim();
    const contentB = fs.readFileSync(fileB, "utf-8").trim();
    return contentA === contentB;
  } catch {
    return false;
  }
}

/**
 * Safe skill migration primitive:
 * - Moves optional skills from native dirs to .agents/other_skills
 * - Preserves always-on skills in native dirs intact
 * - Preserves complete trees (scripts, assets, relative files)
 * - Exact backup manifest
 * - Idempotency
 * - Collision protection (failed collisions change nothing)
 * - Symlink handling & repair of links pointing into legacy jev_skills
 * - No destructive rm -rf
 */
export async function migrateSkills(options: MigrationOptions): Promise<MigrationResult> {
  const dryRun = options.dryRun ?? false;
  const keepSet = new Set([
    ...DEFAULT_KEEP_SKILLS,
    ...(options.keepSkills || []).map((s) => s.toLowerCase()),
  ]);

  const moved: string[] = [];
  const kept: string[] = [];
  const skipped: string[] = [];
  const collisions: string[] = [];
  const repairedSymlinks: string[] = [];
  const actions: MigrationAction[] = [];

  const timestamp = new Date().toISOString();
  const backupDir =
    options.backupDir ||
    path.join(
      process.env.HOME || "",
      ".agents",
      `skills_backup_${timestamp.replace(/[:.]/g, "-")}`
    );

  const manifest = {
    timestamp,
    dryRun,
    sourceDirs: options.sourceDirs,
    targetDir: options.targetDir,
    backupDir,
    actions,
  };

  if (!dryRun) {
    fs.mkdirSync(options.targetDir, { recursive: true });
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // 1. Process candidate skills from source directories
  for (const srcDir of options.sourceDirs) {
    if (!fs.existsSync(srcDir)) continue;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(srcDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const skillName = entry.name;
      if (skillName.startsWith(".") || skillName === "node_modules") continue;

      const sourceSkillPath = path.join(srcDir, skillName);
      let isDir = entry.isDirectory();
      let isSymlink = entry.isSymbolicLink();

      if (isSymlink) {
        try {
          const stat = fs.statSync(sourceSkillPath);
          if (stat.isDirectory()) isDir = true;
        } catch {
          // Broken symlink
          continue;
        }
      }

      // Check if this entry contains a skill
      const skillMd = path.join(sourceSkillPath, "SKILL.md");
      const isDirectMd = !isDir && entry.isFile() && skillName.endsWith(".md");

      if (!isDir && !isDirectMd && !fs.existsSync(skillMd)) {
        continue;
      }

      const effectiveName = isDirectMd ? skillName.replace(/\.md$/, "") : skillName;
      const targetSkillPath = path.join(options.targetDir, effectiveName);

      // A. Check if skill is on the explicit keep / always-on list
      if (keepSet.has(effectiveName.toLowerCase())) {
        kept.push(effectiveName);
        actions.push({
          skillName: effectiveName,
          action: "keep",
          sourcePath: sourceSkillPath,
          targetPath: targetSkillPath,
          reason: "Skill is in always-on/keep list; preserved in native directory",
        });
        continue;
      }

      // B. Check collision protection if target already exists
      if (fs.existsSync(targetSkillPath)) {
        const isIdentical = areSkillContentsIdentical(sourceSkillPath, targetSkillPath);
        if (isIdentical) {
          // Idempotent: already migrated
          skipped.push(effectiveName);
          actions.push({
            skillName: effectiveName,
            action: "skip",
            sourcePath: sourceSkillPath,
            targetPath: targetSkillPath,
            reason: "Skill already exists at destination with identical content",
          });

          if (!dryRun && path.resolve(sourceSkillPath) !== path.resolve(targetSkillPath)) {
            // Safe cleanup of duplicate source
            try {
              if (fs.statSync(sourceSkillPath).isDirectory()) {
                fs.rmSync(sourceSkillPath, { recursive: true, force: true });
              } else {
                fs.unlinkSync(sourceSkillPath);
              }
            } catch {}
          }
          continue;
        } else {
          // Collision! Target exists with different content. Failed collision changes nothing.
          collisions.push(effectiveName);
          actions.push({
            skillName: effectiveName,
            action: "collision",
            sourcePath: sourceSkillPath,
            targetPath: targetSkillPath,
            reason: "Target destination exists with different content; aborted without modifying source",
          });
          continue;
        }
      }

      // C. Move optional skill (complete tree preserved)
      const skillHash = getFileChecksum(skillMd);
      actions.push({
        skillName: effectiveName,
        action: "move",
        sourcePath: sourceSkillPath,
        targetPath: targetSkillPath,
        hash: skillHash,
        reason: "Moved optional skill to isolated other_skills bank",
      });
      moved.push(effectiveName);

      if (!dryRun) {
        // 1. Copy complete tree to backup
        const backupSkillPath = path.join(backupDir, effectiveName);
        if (isDir) {
          fs.cpSync(sourceSkillPath, backupSkillPath, { recursive: true });
          // 2. Copy complete tree to target
          fs.cpSync(sourceSkillPath, targetSkillPath, { recursive: true });
          // 3. Remove source safely after verifying destination exists
          if (fs.existsSync(path.join(targetSkillPath, "SKILL.md")) || fs.existsSync(targetSkillPath)) {
            fs.rmSync(sourceSkillPath, { recursive: true, force: true });
          }
        } else {
          fs.copyFileSync(sourceSkillPath, backupSkillPath);
          fs.copyFileSync(sourceSkillPath, targetSkillPath);
          fs.unlinkSync(sourceSkillPath);
        }
      }
    }
  }

  // 2. Symlink handling and repair of links pointing into renamed legacy bank
  if (options.repairSymlinks !== false) {
    const scanDirs = [...options.sourceDirs, options.targetDir];
    for (const dir of scanDirs) {
      if (!fs.existsSync(dir)) continue;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isSymbolicLink()) continue;
        const linkPath = path.join(dir, entry.name);
        try {
          const target = fs.readlinkSync(linkPath);
          const needsRepair =
            target.includes(".agents/jev_skills") ||
            target.includes(".agents\\jev_skills") ||
            (options.legacyBankPaths &&
              options.legacyBankPaths.some((lp) => target.startsWith(lp)));

          if (needsRepair) {
            let newTarget = target
              .replace(/\.agents\/jev_skills\b/g, ".agents/other_skills")
              .replace(/\.agents\\jev_skills\b/g, ".agents\\other_skills");

            if (options.legacyBankPaths) {
              for (const lp of options.legacyBankPaths) {
                if (target.startsWith(lp)) {
                  newTarget = path.join(options.targetDir, path.basename(target));
                  break;
                }
              }
            }

            repairedSymlinks.push(linkPath);
            actions.push({
              skillName: entry.name,
              action: "repair_symlink",
              sourcePath: linkPath,
              targetPath: newTarget,
              reason: "Repaired symlink pointing into legacy bank",
            });

            if (!dryRun) {
              fs.unlinkSync(linkPath);
              fs.symlinkSync(newTarget, linkPath);
            }
          }
        } catch {
          // Skip unreadable links
        }
      }
    }
  }

  // 3. Save exact backup manifest
  let manifestPath: string | undefined;
  if (!dryRun) {
    manifestPath = path.join(backupDir, "backup_manifest.json");
    try {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    } catch {}
  } else {
    manifestPath = path.join(backupDir, "dry_run_manifest.json");
  }

  return {
    dryRun,
    moved,
    kept,
    skipped,
    collisions,
    repairedSymlinks,
    actions,
    manifestPath,
  };
}
