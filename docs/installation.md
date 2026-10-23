# Installation

Details behind the README install section.

## Requirements

Bash (including macOS Bash 3.2), HTTPS-capable `curl`, `tar` with gzip, standard POSIX utilities and **Bun >= 1.3**. The installer never downloads Bun and never uses `sudo`. It looks for Bun on `PATH`, then `$BUN_INSTALL/bin/bun`, then `$HOME/.bun/bin/bun`. Git is not needed to install; it is needed for online skill imports. The installer tracks `master`: it is not a pinned or signed release.

## Installer flow

```sh
curl -fsSL https://raw.githubusercontent.com/datamonsterr/other-skill/master/install.sh | bash

# Forward setup options:
curl -fsSL https://raw.githubusercontent.com/datamonsterr/other-skill/master/install.sh | bash -s -- \
  --non-interactive --agent codex --scope global

# Custom snapshot parent, project harness:
curl -fsSL https://raw.githubusercontent.com/datamonsterr/other-skill/master/install.sh | bash -s -- \
  --install-dir "$HOME/.local/share/otherskill/installs" -- \
  --non-interactive --agent claude --scope project --cwd "$PWD" --no-companion

# Installer help (no download, no writes):
curl -fsSL https://raw.githubusercontent.com/datamonsterr/other-skill/master/install.sh | bash -s -- --help
```

To inspect first: `curl -fsSL -o install.sh <raw URL>`, read it, then `bash install.sh`.
1. Download the `master` archive from codeload.github.com (HTTP errors fail the run).
2. Extract into a new private snapshot `~/.local/share/otherskill/installs/release.*`.
3. Run `bun install --frozen-lockfile`.
4. Run `otherskill.ts setup` from your original working directory with all forwarded arguments.

`--install-dir DIR` changes the snapshot parent (relative paths resolve from your working directory; keep it outside native skill directories). `--` ends installer option parsing; `-- --help` shows setup help. `--dry-run` previews **setup writes only**: source and dependencies are still installed. Without `--non-interactive` the menu reads from the controlling terminal even through `curl | bash`; without a terminal pass `--non-interactive --agent <harness>`.

## Snapshots

Each run creates a new snapshot. Failed dependency snapshots are removed. Successful snapshots and snapshots where setup was attempted are kept, because the launcher and OpenCode adapter reference them by absolute path. Nothing prunes old snapshots automatically. If setup fails, fix the reported issue and rerun `bun /path/to/release.XXXXXXXX/otherskill.ts setup ...`. `otherskill update` creates a new snapshot and repoints the launcher.

## API key

Inherit `OPENROUTER_API_KEY` from your shell, or forward `--key-env OPENROUTER_API_KEY` to save it privately. Never put the value in arguments. `--key-stdin` needs the installer downloaded to a file first (stdin carries the key); the streamed installer refuses it. Saved keys live in `<home>/.config/otherskill/credentials.json`, mode `0600` (parent `0700`). The inherited environment variable overrides the file. OtherSkill does not read or copy `.env`; the managed launcher runs Bun with `--no-env-file`.

## Launcher

Setup creates the launcher `~/.local/share/otherskill/bin/otherskill`, which hooks call, and a managed copy at `~/.local/bin/otherskill` so `otherskill` runs from `PATH`. The installer warns when `~/.local/bin` is not on `PATH`. Setup leaves an unrelated `~/.local/bin/otherskill` (or a symlinked `~/.local/bin`) untouched. It references the snapshot and Bun by absolute path; rerun setup after moving either. Setup never links the package globally. `jev-skill-selector` is a deprecated alias for the canonical CLI.

## Harness files

| Harness      | Global hook/adapter                        | Project hook/adapter              | Companion (relative to scope root)       |
| ------------ | ------------------------------------------ | --------------------------------- | ---------------------------------------- |
| Claude       | `~/.claude/settings.json`                  | `.claude/settings.json`           | `.claude/skills/use-otherskill/SKILL.md` |
| Codex        | `~/.codex/hooks.json`                      | `.codex/hooks.json`               | `.agents/skills/use-otherskill/SKILL.md` |
| Antigravity  | `~/.gemini/config/hooks.json`              | `.agents/hooks.json`              | `.agents/skills/use-otherskill/SKILL.md` |
| OpenCode 1.x | `~/.config/opencode/plugins/otherskill.ts` | `.opencode/plugins/otherskill.ts` | `.agents/skills/use-otherskill/SKILL.md` |

Setup preserves unrelated settings, hooks and skills. It refuses malformed config, unowned launcher/adapter collisions, modified companions and pre-existing native bank exposure. It never moves native skills or exposes the bank through links or `skills.paths`. Windows and OpenCode 2.x are unverified.

## Portable project hooks

For a repository other people clone, write hooks without absolute home or project paths:

```sh
otherskill setup --scope project --agents claude,codex --portable   # persists "portableHooks": true
otherskill config set portableHooks false --apply                  # back to absolute hooks
```

Requirements: project scope, the project config at `otherskill.config.json` or `.otherskill/config.json` in the project root, a bankPath relative to that file (for example `.otherskill/bank` or, from `.otherskill/config.json`, `bank`), and the launcher installed at `$HOME/.local/share/otherskill/bin/otherskill` on every machine. Otherwise setup fails with "portable hooks require project scope with otherskill.config.json or .otherskill/config.json at the project root".

To keep everything OtherSkill owns in one folder, use `.otherskill/config.json` with `"bankPath": "bank"`, giving `.otherskill/config.json` plus `.otherskill/bank/`. `update` and `config --apply` keep honoring the saved flag.

Generated hooks:
- Claude: `"$HOME/.local/share/otherskill/bin/otherskill" 'find' '--agent' 'claude' '--config' "$CLAUDE_PROJECT_DIR/<config path relative to the project root>"`
- Codex and Antigravity: the same command without `--config`; `find` loads the nearest config from the payload `cwd` or `workspacePaths[0]`.
- OpenCode: a self-contained plugin (marker `// otherskill:portable`) that inlines the adapter and resolves the launcher from `os.homedir()`.

Limits: Antigravity relies on `$HOME` expansion, so it must run hook commands through a shell. Bank provenance files (`.otherskill.json`) still record the original source path.

## Migration from legacy hooks

`otherskill setup --agent claude` removes the legacy `hooks/claude.ts` / `skill_selector` `UserPromptSubmit` entry and lists it under `removedLegacyHooks`. For other harnesses disable old routing hooks yourself to avoid double routing. Legacy backup/setup scripts delegate to safe setup and never copy `.env`.

## Project and global config together

A project config inherits the global config (`~/.config/otherskill/otherskill.config.json`) when it exists: categories are the union by id (project order first, project description wins), enabled categories are the union of both sides (`--categories` replaces the union), and skills are read from the project bank and the global bank, deduplicated by instance and logical ID with the project copy kept. `add`, `create` and `classify` write only to the project bank. Set `"inheritGlobal": false` in the project config, or use `--scope global`, to route with the project alone.
