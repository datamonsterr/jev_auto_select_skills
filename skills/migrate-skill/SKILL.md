---
name: migrate-skill
description: Safely migrate optional skills into .agents/other_skills while preserving always-on skills in native agent directories. Features dry-run, exact backup manifest, idempotency, collision protection, and symlink repair.
---

# Migrate Skill

Safe, non-destructive migration utility to relocate optional task-specific skills from native agent directories (`~/.agents/skills`, `~/.claude/skills`, `~/.codex/skills`, etc.) into the isolated skills bank (`~/.agents/other_skills/` or `./.agents/other_skills/`).

## When to Use

- When organizing a crowded skills directory into **always-on** native skills vs **dynamically routed** skills.
- When migrating from the legacy `.agents/jev_skills` directory to `.agents/other_skills`.
- When fixing broken symlinks pointing into retired legacy skill bank paths.
- To eliminate agent context bloat by moving 70+ optional skills out of native auto-load directories.

## Safe Migration Guarantees

1. **Always-On Preservation**: Skills designated as universal/always-on (e.g. `caveman`, `skill_selector`) remain intact in their native directory. Their originals are never deleted or modified.
2. **Complete Tree Preservation**: Complete skill directories (including `scripts/`, `references/`, `examples/`, and assets) are moved together with `SKILL.md`.
3. **Dry-Run Preview**: Supports `--dry-run` to inspect all actions without modifying the filesystem.
4. **Exact Backup Manifest**: Automatically writes an exact JSON manifest recording timestamp, source/target paths, and file hashes in `backup_manifest.json`.
5. **Idempotency**: Running migration repeatedly is a safe no-op once skills are migrated.
6. **Collision Protection**: If a target skill already exists with different contents, the operation is rejected and the source is untouched.
7. **Symlink Handling & Repair**: Materializes optional skills from native aliases and the legacy bank into `.agents/other_skills`, then removes verified optional native aliases. Original symlinks remain in the backup for rollback.
8. **No Destructive `rm -rf`**: Deletion is only performed on specifically verified moved files, never on parent folders or kept skills.

## CLI Usage

Run via `skill_selector`:

```bash
# Preview actions without modifying disk
skill_selector migrate --dry-run

# Run full migration with default keep list (caveman, superpowers, etc.)
skill_selector migrate --apply

# Specify additional skills to keep in native directory
skill_selector migrate --apply --keep my-persona-skill,another-always-on

# Custom target and source directories
skill_selector migrate --apply --source ~/.agents/skills --target ~/.agents/other_skills --backup ~/.agents/skills_backup
```

Direct script execution:

```bash
bun run scripts/migrate-skills.ts --dry-run
bun run scripts/migrate-skills.ts --apply
```


## Rollback

Every apply returns `manifestPath`. Restore only after previewing the guarded rollback:

```bash
skill_selector migrate --rollback /absolute/backup/backup_manifest.json --dry-run
skill_selector migrate --rollback /absolute/backup/backup_manifest.json --apply
```

Rollback preflights every complete tree and refuses to overwrite user edits. Default sources include the canonical global legacy bank; specify project `--source` directories explicitly for project migrations. Collisions block the entire migration before any writes.

Migration and rollback default to preview; `--apply` is required for writes. Use `--legacy-bank /project/.agents/jev_skills` with project sources to include the canonical optional bank. Use `--keep` for additional project-specific always-on skills.

## Explicit source-variant resolution

Default behavior rejects differing source trees. Use `--prefer-native` only when native behavior should take precedence over legacy optional-bank variants. Precedence is shared `.agents/skills` first, other native sources in caller order, then directories explicitly supplied as `--legacy-bank`, regardless of their insertion order. Whole trees are selected; skill bodies, frontmatter and assets are never rewritten or merged. Every original variant is copied into the private backup and verified before any source is removed. Manifest actions record the selected source and exact backup path for each variant. Rollback restores all original variants and permissions; user edits block rollback before changes.

A differing preexisting `other_skills` destination always blocks the whole migration, even with this flag. Kept native directories stay intact; kept native aliases into a migrated legacy bank are retargeted and remain available.

```bash
# Preview project migration with deliberate native precedence
skill_selector migrate --source /project/.agents/skills --source /project/.claude/skills --legacy-bank /project/.agents/jev_skills --target /project/.agents/other_skills --prefer-native --dry-run --json

# Apply only after reviewing selectedSource, backupPath, and kept skills
skill_selector migrate --source /project/.agents/skills --source /project/.claude/skills --legacy-bank /project/.agents/jev_skills --target /project/.agents/other_skills --prefer-native --apply --json
```

Use a normal terminal for protected global paths. Preview and review first; never bypass harness read-only mounts. Exact backups default to `~/.local/state/skill-selector/backups`.

## Retire obsolete selector and dispatch skills

After installing `skill_selector` and verifying it, archive the obsolete names from every native discovery root and both old/new banks. The retirement helper touches only `jev-dispatch` and `jev-skill-selector`. It requires an accessible installed replacement and backs up exact originals outside discovery catalogs using the same guarded rollback manifest format. Defaults to preview; `--apply` is explicit. Run this after physical bank migration and configuration cutover, so old instructions cannot route agents back to retired tools. Installation no longer recreates legacy skill names.

```bash
# Preview in a normal terminal; add --root for project or account-specific native directories.
bun run /home/dat/dev/jev_skill_selector/scripts/retire-legacy-skills.ts --replacement /home/dat/.agents/skills/skill_selector/SKILL.md --root /home/dat/.agents/skills --root /home/dat/.claude/skills --root /home/dat/.codex/skills --root /home/dat/.gemini/config/skills --root /home/dat/.config/opencode/skills --root /home/dat/.agents/jev_skills --root /home/dat/.agents/other_skills --dry-run

# Repeat the reviewed arguments with --apply instead of --dry-run.
# Rollback uses the returned manifest:
skill_selector migrate --rollback /private/retirement/backup_manifest.json --dry-run
skill_selector migrate --rollback /private/retirement/backup_manifest.json --apply
```

Safe sequence: install new selector and account entrypoints; review migration and backup plans; migrate optional skill banks; switch config/hooks to the new selector; retire legacy names; restart and verify harnesses. Keep all returned manifests for rollback. Protected global paths require a normal terminal; never bypass read-only mounts.
