# 0006: Portable project hooks

Status: accepted

## Context

Project hooks embedded the launcher path, `--home` and `--config` as absolute paths, and the OpenCode plugin imported a release-specific adapter path. Committing them broke every other machine.

## Decision

- Config field `portableHooks` (set by `--portable` or `config set portableHooks true|false`) makes setup write path-free hooks. It requires project scope and a project config at `<root>/otherskill.config.json` or `<root>/.otherskill/config.json`; otherwise setup throws a fixed message.
- Shell hooks call `"$HOME/.local/share/otherskill/bin/otherskill" 'find' '--agent' <agent>` plus hook params, with no `--home`. Claude adds `--config "$CLAUDE_PROJECT_DIR/<config path relative to the root>"`; Codex and Antigravity let `find` resolve the nearest config from the payload cwd.
- The OpenCode plugin inlines `plugins/otherskill-opencode.ts` (single source) and builds the launcher path from `os.homedir()`.
- Config discovery also accepts `.otherskill/config.json` in each ancestor, so a project can keep its config and bank together under `.otherskill/`. The root `otherskill.config.json` wins when a directory has both.
- Hook replacement and `doctor` recognize both the absolute and the portable form; default output is unchanged.

## Consequences

Each machine needs the launcher at the standard location and a project-relative bank path. Antigravity depends on shell `$HOME` expansion. The inlined OpenCode adapter is a snapshot; rerun setup or `update` to refresh it.
