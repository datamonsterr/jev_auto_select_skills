# OtherSkill

OtherSkill keeps categorized skills outside native discovery. A free OpenRouter model selects categories, then concurrent HTTP requests select skills inside each selected category. Hooks inject only selected names, complete descriptions and provenance, never full skill bodies automatically.

Requires Bun, Git for online imports and a POSIX shell for the managed launcher. Supported adapters are Claude, Codex, Antigravity and OpenCode 1.x. Windows and OpenCode 2.x lifecycle integration are unverified.

## Setup

```sh
bun install --frozen-lockfile
bun otherskill.ts --help
bun otherskill.ts setup
```

The interactive menu selects harness, global/project scope, hidden OpenRouter key, free model, enabled categories and companion installation. `otherskill config` offers quick edits and apply. Explicit harness/scope/companion flags take precedence over menu answers. Cancellation and `--dry-run` write nothing.

Setup creates a managed launcher at `~/.local/share/otherskill/bin/otherskill`; add that directory to PATH, invoke it directly, or explicitly use `bun link`. The launcher references this checkout and Bun by absolute path: keep the checkout in place, or rerun setup after moving it. Setup never globally links the package. The package's `jev-skill-selector` binary is a deprecated alias for the canonical CLI.

```sh
# Obtain OPENROUTER_API_KEY from your shell/secret manager, never an argument literal.
bun otherskill.ts setup --non-interactive --agent claude --scope global \
  --key-env OPENROUTER_API_KEY --model inception/mercury-decide:free \
  --categories frontend/ui-ux,frontend/storytelling,backend,testing,management

# Preview in scratch roots, without changing your real home.
bun otherskill.ts setup --non-interactive --agent codex --scope project \
  --home /tmp/otherskill-home --cwd /tmp/otherskill-project --dry-run
```

`--key-stdin` accepts a secret-manager pipe. Saved keys live in the selected home's `.config/otherskill/credentials.json`, mode `0600`; a newly created parent uses `0700`. Keys never enter project config, argument literals, menu echoes or diagnostics. Inherited `OPENROUTER_API_KEY` overrides the private file. OtherSkill does not copy/search `.env`; Bun's automatic `.env` loading still applies when launched from a directory containing one.

Setup preserves unrelated native settings, hooks and skills. It refuses malformed config, unowned launcher/adapter collisions, modified companions and pre-existing native bank exposure. `--no-companion` installs only hooks. It never moves/removes native skills or exposes the bank through links or `skills.paths`.

| Harness | Global hook/adapter | Project hook/adapter | Companion relative to scope root |
| --- | --- | --- | --- |
| Claude | `~/.claude/settings.json` | `.claude/settings.json` | `.claude/skills/use-otherskill/SKILL.md` |
| Codex | `~/.codex/hooks.json` | `.codex/hooks.json` | `.agents/skills/use-otherskill/SKILL.md` |
| Antigravity | `~/.gemini/config/hooks.json` | `.agents/hooks.json` | `.agents/skills/use-otherskill/SKILL.md` |
| OpenCode 1.x | `~/.config/opencode/plugins/otherskill.ts` | `.opencode/plugins/otherskill.ts` | `.agents/skills/use-otherskill/SKILL.md` |

All generated integrations use the same launcher and **`find --agent <harness>`**. Claude/Codex `UserPromptSubmit` hooks read native stdin payloads. Codex may require trust review through `/hooks`. Antigravity uses a named `PreInvocation` group, skips repeated invocations, and reads the original request from the supplied transcript when needed. OpenCode uses `experimental.chat.messages.transform`, appends a synthetic text part, caches per user message and passes the prompt through a subprocess argument array. Global hooks honor the event workspace's config; project hooks pin project config explicitly.

## Add complete skills

```sh
otherskill add ./my-skill
otherskill add github:anthropics/skills --path skills/frontend-design
otherskill add owner/repository --ref release/v1 --path skills/design
otherskill add https://skills.sh/owner/repository/skill-name

# Explicit offline classification or manual correction:
otherskill add ./my-skill --category frontend/ui-ux --category testing
otherskill classify ./my-skill --category frontend/ui-ux --category testing
otherskill list
```

Automatic classification sends complete skill name/description and configured taxonomy to the free model. Every category meeting `categoryThreshold` receives a **real complete copy**, preserving scripts, references, assets, file modes and attribution. Disabled routing categories may still hold classified copies. `none` means no import; use explicit categories if necessary.

Select one directory containing `SKILL.md`; use `--path` for multi-skill repositories. GitHub tree URLs are accepted; refs containing slashes should use `--ref`. Symlinks/special files are rejected; `.git` internals are excluded. Repository-root licenses/notices are copied when absent from the skill directory. Review imported code/licenses before executing it.

```text
~/.local/share/otherskill/bank/
  frontend/ui-ux/design--<source-hash>/
    SKILL.md
    scripts/...
    references/...
    assets/...
    .otherskill.json
  testing/design--<source-hash>/
    SKILL.md
    scripts/...
    references/...
    assets/...
    .otherskill.json
```

Metadata records source URL/path, requested ref, resolved Git revision, category and logical identity. Distinct sources with the same name remain distinct; category copies have scoped instance identities. Re-adding stages complete trees before replacing only owned destinations. Reclassification adds/replaces requested memberships and preserves existing memberships; it does not silently delete copies. The source remains unchanged.

`install` aliases `add`. Optional local creation emits ordinary YAML frontmatter and supplied instructions, then classifies/copies the result. It refuses an existing source destination. If automatic classification fails, the generated source remains available for retry.

```sh
otherskill create ./my-skill --name my-skill \
  --description 'When this reusable capability applies' \
  --instructions-file ./instructions.md --category management
otherskill search 'accessibility'
```

`search` performs real GitHub code search with `path:SKILL.md` and returns source links. It uses authenticated `gh api` or `GH_TOKEN`; unavailable access is an explicit error. `find` exclusively means routing.

## Find skills

```sh
otherskill find --agent codex --prompt 'Design an accessible form and test it'
printf '%s' '{"prompt":"Design an accessible form and test it"}' | otherskill find --agent claude
otherskill find --agent opencode --prompt 'Review an API change' --json
```

Invoke through an argument array or proper shell quoting. Never interpolate prompt text into executable shell code. `--agent` overrides detection. `hook` aliases `find`; `select` returns JSON routing results. Native output is Claude/Codex `hookSpecificOutput.additionalContext`, Antigravity `injectSteps`, or an OpenCode selected-skill list plus `context`.

Stage one receives the original full prompt and all enabled category descriptions. Each selected nonempty category gets a concurrent request containing the same full prompt and **all candidates with complete descriptions**. Logical calls equal `1 + N`; bounded retries can add HTTP attempts. These are HTTP requests, never harness subagents. Injection deduplicates logical copies while retaining category provenance and preserves distinct same-name sources.

Choices, finite probabilities, normalization and winning choice are validated. Inputs are never silently truncated or candidates omitted. Context/candidate/selection overflow returns a safe diagnostic so you can raise limits or reorganize categories. Only one explicit `provider/model:free` is accepted. Paid overrides, fallback chains and silent model substitution are forbidden.

A stage-one failure injects nothing. Category failures can return validated successful categories with explicit `partial` status. Hook failures exit successfully with protocol-correct empty context. Fixed diagnostics never include prompts, keys or upstream response bodies. JSON results retain status, category/instance provenance and logical call counts.

## Config and doctor

Precedence: **`--config` / `OTHERSKILL_CONFIG` > nearest ancestor `otherskill.config.json` > `~/.config/otherskill/otherskill.config.json` > defaults**. The chosen file is complete, with schema defaults filling absent fields; global/project files are not implicitly merged. Relative bank paths resolve beside that file; `~/` uses the selected home. Invalid config is an error, never a fallback.

[otherskill.config.example.json](otherskill.config.example.json) contains editable starter categories and limits. Stable category IDs support arbitrary nesting. Traversal, duplicate IDs, unknown enabled IDs, native overlap and symlink aliases into native paths are rejected.

```sh
otherskill config
otherskill config show
otherskill config get model
otherskill config get categories
otherskill config set model inception/mercury-decide:free
otherskill config set categories frontend/ui-ux,testing
otherskill config set key --key-env OPENROUTER_API_KEY
otherskill config show --scope global
otherskill config set scope project --apply --agent codex
otherskill config set limits '{"concurrency":2,"retries":1}'
otherskill doctor
otherskill doctor --live
```

`categories` edits enabled routing IDs. `get taxonomy` returns all IDs/descriptions; `set taxonomy '<JSON array>'` changes taxonomy. `get key` only reports configured/unavailable. `--scope global` bypasses project config; project scope targets the project. `--apply` updates harness hooks. Scope changes preserve the previous scope's hooks/config.

Defaults: concurrency 4, retries after the initial request 1, timeout 10 seconds, retry delay 250ms, request bytes 60000, candidates 200, category/skill thresholds 0.05, selected categories 20, selected skills 10. All have validated configuration bounds. Doctor checks paths, native exposure and companion presence. Ordinary doctor does not call a provider; `--live` makes one tiny free-only request. Configured paths/key presence do not prove running-harness activation or valid credentials.

## Migration and verification

Legacy backup/setup scripts now delegate to safe setup; they do not migrate/remove native skills, copy `.env`, globally link the checkout or expose a bank. Existing legacy installations remain intact: explicitly disable old routing hooks before activating the new hook to avoid duplicate routing. This PR does not activate any real home installation.

The only installation skill source is the orchestrator-authored [use-otherskill](examples/polly/skills/use-otherskill/SKILL.md). Legacy root/bundled selector skill prose remains unchanged for history and is not installed. Commands integrate the requested capability areas of skill-creator, skill-installer, find-skills, write-a-skill and writing-skills; their prose/code was not copied wholesale. Imported skills retain upstream files/licenses and source metadata.

```sh
bun install --frozen-lockfile
mkdir -p .tmp
TMPDIR="$PWD/.tmp" bun test tests/
bunx tsc --noEmit
bun run build
TMPDIR="$PWD/.tmp" python3 scripts/smoke-interactive.py
TMPDIR="$PWD/.tmp" bun scripts/smoke-live.ts
```

Use a writable scratch directory if system `/tmp` quota is exhausted. Offline tests exercise full copies, identities, actual concurrency at the HTTP boundary, response validation, CLI subprocesses and adapters. Menu smoke uses a real PTY and synthetic key. The inherited evaluation tests use controlled HTTP fixtures; their results are offline evidence. Real online evaluation scripts remain separate and were not run without credentials. Live smoke checks the public decision-model catalog and, only with an existing credential, tiny Mercury and two-stage requests. See [measured evidence and limitations](docs/otherskill-evidence.md).

Primary protocol references: [OpenRouter Decisions example](https://openrouter.ai/blog/tutorials/jev-vs-llm-when-to-use-each/), [decision model catalog](https://openrouter.ai/api/v1/models?output_modalities=decisions), [Claude hooks](https://code.claude.com/docs/en/hooks), [Codex hooks](https://learn.chatgpt.com/docs/hooks), [Antigravity hooks](https://antigravity.google/docs/hooks), [OpenCode plugins](https://opencode.ai/docs/plugins/).
