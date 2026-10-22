# Model discovery scripts

Vendored from [openrouterteam/skills `openrouter-models`](https://github.com/openrouterteam/skills/tree/main/skills/openrouter-models). Re-sync when the upstream pack changes.

## Setup

Run from **this skill’s** `scripts/` directory (resolve the skill path first):

```bash
cd <path-to-skills>/openrouter/scripts && npm install
```

`node_modules/` is gitignored under `scripts/`.

`OPENROUTER_API_KEY` is optional for list/search/compare/resolve. Required for `get-endpoints.ts`.

## Decision tree

| User wants… | Command |
| --- | --- |
| All / sorted models | `npx tsx list-models.ts` (`--sort newest\|price\|context\|throughput`) |
| Category filter | `npx tsx list-models.ts --category programming` |
| Search by name | `npx tsx search-models.ts "claude"` |
| Image/file/audio capable | `npx tsx search-models.ts --modality image` |
| Informal name → ID | `npx tsx resolve-model.ts "claude sonnet"` |
| Side-by-side compare | `npx tsx compare-models.ts "id-a" "id-b"` |
| Provider latency/uptime/throughput | `npx tsx get-endpoints.ts "model-id" --sort latency\|throughput\|uptime\|price` |

Categories: `programming`, `roleplay`, `marketing`, `marketing/seo`, `technology`, `science`, `translation`, `legal`, `finance`, `health`, `trivia`, `academia`.

## Resolve confidence

| Confidence | Action |
| --- | --- |
| `high` (≥0.85) | Use the ID |
| `medium` (≥0.55) | Confirm with user |
| `low` (≥0.30) | Ask user to clarify |

Two-step: resolve → feed exact `id` into compare/endpoints.

## Live API (no scripts)

```bash
# Text models (default). Add output_modalities=all|image|... as needed
curl "https://openrouter.ai/api/v1/models?supported_parameters=tools&sort=pricing-low-to-high"

# Single model (aliases resolve)
curl "https://openrouter.ai/api/v1/model/openai/gpt-4o"
```

Useful query params: `output_modalities`, `supported_parameters`, `sort` (`pricing-low-to-high`, `pricing-high-to-low`, `context-high-to-low`, `throughput-high-to-low`, `latency-low-to-high`, `most-popular`, `newest`), `category`, `offset`/`limit`.

Pricing strings are USD **per token** — multiply by 1e6 for $/M. Check `architecture.input_modalities` / `output_modalities` and `supported_parameters` (e.g. `tools`, `structured_outputs`, `reasoning`).

Provider detail: `GET /api/v1/models/{author}/{slug}/endpoints`.
