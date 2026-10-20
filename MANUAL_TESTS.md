# Skill selector migration checks

Use a fresh isolated home for staging. Do not run tests against live config or credentials.

1. Run `bun test tests/`. All provider tests inject mocked HTTP clients and dummy API keys; no paid model or real HTTP call is needed.
2. Stage with `bun run scripts/setup-agent.ts all --home /tmp/selector-stage --repo /home/dat/dev/jev_skill_selector`. Create the four `.omnigent/accounts/accountN/.gemini/config` directories in the staging home first if inspecting all account entrypoints. Verify each of the five Gemini roots contains `config/plugins/skill_selector/{plugin.json,hooks.json}` pointing to the canonical runtime, and `migrate-skill` is discoverable in native directories and `other_skills`. Staging never calls `bun link`.
3. Preview migration with `bun run scripts/migrate-skills.ts --source /tmp/selector-fixture/native --source /tmp/selector-fixture/jev_skills --target /tmp/selector-fixture/other_skills --backup /tmp/selector-fixture/backup --dry-run --json`. Check no filesystem writes occurred.
4. Apply by replacing `--dry-run` with `--apply`. Read migrated `SKILL.md` and every script through the resulting canonical paths. Keep skills remain in their native directories. Collision returns nonzero and changes nothing.
5. Use `bun run scripts/migrate-skills.ts --rollback /tmp/selector-fixture/backup/backup_manifest.json --dry-run`, then replace `--dry-run` with `--apply`. Original directories, modes and symlinks must return. Edit a destination asset before rollback and verify rollback refuses without partially restoring sources.
6. In OpenCode, send a user turn, allow multiple tool iterations, then send another turn. Confirm one selection request per session/user message identity, at most one selector injection, and no prior-turn instructions after an empty selection or failure.

Global application requires a normal terminal when the harness mounts `.agents` or `.codex` read-only. Review and apply staged files with the separate configuration migration helper; do not bypass mounts. Retain backups and manifests until all harnesses have been restarted and verified.

Migration and rollback default to preview; `--apply` is required for writes. Use `--legacy-bank /project/.agents/jev_skills` with project sources to include the canonical optional bank. Use `--keep` for additional project-specific always-on skills.

To resolve differing source variants explicitly, add `--prefer-native` to both preview and apply. Review every `selectedSource` and `backupPath` in the plan. Verify all versions in the private backup, selected complete-tree availability, and restoration of all versions after rollback. Differing preexisting destinations must still block with zero writes. See `tests/migration_variants.test.ts` for shared-native precedence, preserved permissions, guarded rollback and partial-failure recovery.
