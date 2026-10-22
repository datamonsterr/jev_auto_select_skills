# OtherSkill acceptance evidence

Worktree: `.worktrees/otherskill-awareness`; branch: `polly/otherskill-awareness`.
Contract base: `ffa748ef2cabd35e5598816e6e413d2d2234a581`.
Upstream PR base is `4eda5a4be869d8b9794c5ccc371147f1c03f9561` (`master`), integrated without dropping upstream tests. The PR records exact current base/head SHAs. The PR is not merged; no real home activation is performed.

## Baseline and final gates

Baseline `bun install --frozen-lockfile` succeeded. Baseline `bun test tests/` collected/executed 45 test cases: 41 passed and four failed because no OpenRouter credential was configured. Baseline `bunx tsc --noEmit` reported existing strict-index/type errors in hooks, provider/model/parser, setup/evaluation scripts and tests. These were repaired with guarded indexing, complete fixture types and the new safe adapters; strict checking was retained.

A baseline legacy setup test generated a checkout-local `.env` identical to the tracked example. It was verified byte-for-byte against the base example and removed. The replacement setup does not create/copy `.env`. Native user-home skills/configuration were not installed, migrated, moved or removed.

System `/tmp` reached the user's tmpfs quota (`EDQUOT`) during temporary-fixture writes. Verification uses a writable checkout-local ignored `.tmp` via `TMPDIR`; no unrelated temporary files were removed.

| Command | Measured result |
| --- | --- |
| `bun install --frozen-lockfile` | Passed; 18 installs across 19 packages checked |
| `TMPDIR="$PWD/.tmp" bun test tests/` | 115 passed, 0 failed; 115 collected/executed test cases across 25 files |
| `bunx tsc --noEmit` | Passed, no errors |
| `bun run build` | Passed, Bun-target CLI bundle in ignored `.tmp` |
| `TMPDIR="$PWD/.tmp" python3 scripts/smoke-interactive.py` | Actual PTY setup/config menus passed; synthetic key absent from captured output; mode 0600; project Codex and global Claude scopes verified |
| `TMPDIR="$PWD/.tmp" bun test tests/otherskill-cli.test.ts` | Isolated subprocess workflows for help/setup/add/find/config and all exposed management/routing aliases; repeated setup, settings/hooks/skills preservation and malformed-config refusal |
| `git diff --check` | Passed |

There was no baseline lint script. OtherSkill source formatting is checked with `bunx prettier@3.6.2 --check` over the changed OtherSkill source/tests; no skill prose is formatted or edited.

The test totals above count collected/executed test cases rather than commands/CLI invocations. CLI test functions each execute multiple subprocess cases. Origin/master advanced after the original baseline; its migration/discovery/safety tests and controlled HTTP evaluation fixtures were integrated. All final evaluation fixture tests run offline; they are not live benchmarks. The four baseline credential-dependent failures are retained as historical baseline evidence.

## Requirement evidence map

| Requirement | Implementation and behavioral evidence |
| --- | --- |
| Canonical setup/add/find/config; correct aliases/help | `otherskill.ts`; `tests/otherskill-cli.test.ts` executes real subprocess commands, with a controlled HTTP preload for successful model cases |
| Interactive harness/scope/key/model/category choices | `lib/otherskill/menu.ts`; `scripts/smoke-interactive.py` uses PTY input/output and reloads persisted settings |
| Secure key storage; no project key or echo | `lib/otherskill/credentials.ts`; CLI tests assert synthetic key never reaches output/config, file mode 0600; PTY smoke verifies hidden entry |
| Explicit/project/global/default precedence | `lib/otherskill/config.ts`; precedence test covers nearest ancestor, explicit override, global scope bypass and global fallback |
| Config-defined nested taxonomy and safety | Config tests cover stable nested IDs, duplicates/traversal, paid models/fallback arrays, native overlap and symlink aliases |
| Every matching category gets a complete tree | `lib/otherskill/bank.ts`; bank test checks nested references, executable scripts, licenses, multiple matches and repeatability |
| Same-name copies remain scoped | Bank and routing tests verify distinct sources survive, category instance identities differ and same logical imports deduplicate only at injection |
| Full prompt and all descriptions, 1+N, genuine concurrency | Routing tests inspect request payloads, use a two-request barrier, verify 3 calls for 2 categories and verify concurrency cap 2 across 5 category calls |
| No silent candidate/context/result truncation | Routing tests assert explicit failure before category requests when candidates/context exceed limits and safe failure when result limits overflow |
| Free default/overrides/retries/response validation | Config and routing tests reject paid chains/overrides, bound HTTP retries, avoid retrying permanent errors, reject unknown choices and invalid distributions |
| Partial/error responses never invent selections | Routing tests verify empty stage-one failure and explicit partial status with only validated successful categories; upstream text is absent from diagnostics |
| Native hidden bank and only companion installed | Setup uses `.claude/skills/use-otherskill` or `.agents/skills/use-otherskill`; tests verify global/project adapters without `skills.paths`; native symlink/config exposure is refused |
| Explicit harness and non-blocking hook protocols | Adapter and CLI tests verify all four empty-output protocols, original stdin prompt extraction, Antigravity transcript and invocation guards |
| OpenCode native API and safe prompt transport | Adapter test checks literal argument transport, synthetic context, per-message cache and repeated transformations; no shell interpolation |
| Idempotent setup/preservation/malformed refusal | CLI/setup tests preserve unrelated native skill bytes, hook groups and settings; repeated installation does not duplicate hooks; malformed config remains unchanged |
| Doctor detects stale installations | Adapter test modifies the temporary managed launcher and verifies source-path mismatch diagnostics |
| Online source/ref/path validation and real search | Bank tests reject ref/path injection and traversal; real GitHub search/import observations below |
| Destructive setup retired | Shell/PowerShell scripts are thin canonical CLI wrappers; legacy programmatic setup delegates to safe setup; neither consolidates native skills |
| Companion authorship | Orchestrator's `examples/polly/skills/use-otherskill/SKILL.md` included unchanged; SHA256 `e7138a1cfe8a198d634138eddf94b23a10b4757aa204e2c7b08e3572f74aed0b` |

## Live evidence and limits (2026-10-22 UTC)

`TMPDIR="$PWD/.tmp" bun scripts/smoke-live.ts` retrieved the [official decision-model catalog](https://openrouter.ai/api/v1/models?output_modalities=decisions). It confirmed `inception/mercury-decide:free`, context length 65536, `text+image->decisions`, and both prompt/completion prices zero. The unfiltered chat model catalog does not include Decisions models; the smoke explicitly requests `output_modalities=decisions`.

The [official Decisions example](https://openrouter.ai/blog/tutorials/jev-vs-llm-when-to-use-each/) confirms `POST https://openrouter.ai/api/alpha/decisions` with state, typed questions, criteria and probabilistic answers. The model remains configurable and no paid fallback exists.

**Tiny Mercury inference, live two-stage inference and online benchmarks are unavailable: no configured OpenRouter credential.** The smoke reports this explicitly. Offline model behavior uses a controlled HTTP boundary/preload and is not claimed as live provider quality or availability.

Real GitHub discovery succeeded with authenticated `gh api` through `otherskill search accessibility`, returning 5 source results. Real isolated online import succeeded with:

```sh
TMPDIR="$PWD/.tmp" bun otherskill.ts add github:anthropics/skills \
  --path skills/frontend-design --category frontend/ui-ux \
  --home "$PWD/.tmp/online-smoke/home" --cwd "$PWD/.tmp/online-smoke"
```

It imported one `frontend-design` instance, source `https://github.com/anthropics/skills/tree/HEAD/skills/frontend-design`, requested ref `HEAD`, resolved revision `dbd4588f9e1033efb41dad4bef2f7947c8993d44`, including `LICENSE.txt` and source metadata. This used explicit classification; it is evidence of live source transport/copy/attribution, not live automatic model classification. Imported content remains only in ignored temporary roots.

Native formats were checked against [Claude hooks](https://code.claude.com/docs/en/hooks), [Codex hook/trust/output docs](https://learn.chatgpt.com/docs/hooks), [Antigravity hook docs](https://antigravity.google/docs/hooks) and installed Antigravity 1.4.4 hook documentation, and [OpenCode plugin docs](https://opencode.ai/docs/plugins/) for the installed 1.18.35 generation. Tests execute generated hooks/adapters in isolation. No claim is made that a real agent session loaded these hooks. Codex trust review/restart and actual home activation remain separate user operations. Windows and OpenCode 2.x are unverified.

## Review follow-up

A read-only independent contract review found attribution symlink disclosure, interactive flag precedence and global setup scope-loading issues. The implementation now validates attribution with lstat and confinement before writes, fixes explicit menu flags and target-scope reload, establishes failure output protocol before strict argument parsing, derives native hook timeouts from the routing budget, and bounds stalled response bodies. Regression tests and the PTY smoke cover these paths. The review follow-up reported no remaining blockers; the primary agent performs all source/test changes and final full verification.

Upstream OpenCode deduplication assertions were ported to the native synthetic-text-part API, retaining concurrent/repeated-transform and stale-context-on-empty/failure coverage. The upstream heuristic fallback on provider errors was intentionally replaced with an empty unavailable result and fixed diagnostics to satisfy the no-invented-selection contract. Explicit legacy migration remains available but setup does not invoke it or activate other account homes.
