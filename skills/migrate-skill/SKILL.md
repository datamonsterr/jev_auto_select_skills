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

1. **Always-On Preservation**: Skills designated as universal/always-on (e.g. `caveman`, `cavecrew`, `using-superpowers`, `superpowers`, `skill_selector`, `triage`) remain intact in their native directory. Their originals are never deleted or modified.
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
skill_selector migrate

# Specify additional skills to keep in native directory
skill_selector migrate --keep my-persona-skill,another-always-on

# Custom target and source directories
skill_selector migrate --source ~/.agents/skills --target ~/.agents/other_skills --backup ~/.agents/skills_backup
```

Direct script execution:

```bash
bun run scripts/migrate-skills.ts --dry-run
bun run scripts/migrate-skills.ts
```


## Rollback

Every apply returns `manifestPath`. Restore only after previewing the guarded rollback:

```bash
skill_selector migrate --rollback /absolute/backup/backup_manifest.json --dry-run
skill_selector migrate --rollback /absolute/backup/backup_manifest.json
```

Rollback preflights every complete tree and refuses to overwrite user edits. Default sources include the canonical global legacy bank; specify project `--source` directories explicitly for project migrations. Collisions block the entire migration before any writes.
