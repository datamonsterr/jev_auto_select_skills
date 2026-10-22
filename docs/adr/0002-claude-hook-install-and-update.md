# 0002: Single Claude hook install and `update` command

Status: accepted

## Context

Older installs left a `hooks/claude.ts` `skill_selector` hook, so upgrades could double-route. Installs from `curl | bash` also had no upgrade path.

## Decision

- `setup --agent claude` and `config --apply` write exactly one `UserPromptSubmit` hook (global or project settings), idempotently, preserving every other hook and embedding any hook params. They remove the legacy entry and report it (`removedLegacyHooks`); `--dry-run` writes nothing.
- `otherskill update` re-runs the installer flow: fetch the `master` (or `--ref`) tarball, new snapshot, `bun install --frozen-lockfile`, repoint the launcher, reapply setup. `--check` compares installed commit with remote HEAD without writing. In a git checkout it prints `git pull` instead.

## Consequences

Re-running setup is safe. Old snapshots accumulate (no pruning) because launchers may reference them. Updates track a moving branch, not signed releases.
