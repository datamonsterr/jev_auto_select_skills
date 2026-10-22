# Installation

Details behind the README install section.

## Requirements

Bash (including macOS Bash 3.2), HTTPS-capable `curl`, `tar` with gzip, standard POSIX utilities and **Bun >= 1.3**. The installer never downloads Bun and never uses `sudo`. It looks for Bun on `PATH`, then `$BUN_INSTALL/bin/bun`, then `$HOME/.bun/bin/bun`. Git is not needed to install; it is needed for online skill imports. The installer tracks `master`: it is not a pinned or signed release.

## Installer flow

```sh
curl -fsSL https://raw.githubusercontent.com/datamonsterr/jev_auto_select_skills/master/install.sh | bash

# Forward setup options:
curl -fsSL https://raw.githubusercontent.com/datamonsterr/jev_auto_select_skills/master/install.sh | bash -s -- \
  --non-interactive --agent codex --scope global

# Custom snapshot parent, project harness:
curl -fsSL https://raw.githubusercontent.com/datamonsterr/jev_auto_select_skills/master/install.sh | bash -s -- \
  --install-dir "$HOME/.local/share/otherskill/installs" -- \
  --non-interactive --agent claude --scope project --cwd "$PWD" --no-companion

# Installer help (no download, no writes):
curl -fsSL https://raw.githubusercontent.com/datamonsterr/jev_auto_select_skills/master/install.sh | bash -s -- --help
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

Inherit `OPENROUTER_API_KEY` from your shell, or forward `--key-env OPENROUTER_API_KEY` to save it privately. Never put the value in arguments. `--key-stdin` needs the installer downloaded to a file first (stdin carries the key); the streamed installer refuses it. Saved keys live in `<home>/.config/otherskill/credentials.json`, mode `0600` (parent `0700`). The inherited environment variable overrides the file. OtherSkill does not read or copy `.env`; Bun's own `.env` loading still applies in the launch directory.

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

## Migration from legacy hooks

`otherskill setup --agent claude` removes the legacy `hooks/claude.ts` / `skill_selector` `UserPromptSubmit` entry and lists it under `removedLegacyHooks`. For other harnesses disable old routing hooks yourself to avoid double routing. Legacy backup/setup scripts delegate to safe setup and never copy `.env`.
