---
name: openrouter
description: >-
  Choose OpenRouter models and routers, query live catalog data, use structured
  outputs and batch inference, and debug routing with metadata. Use when working
  with OpenRouter APIs, openrouter/auto, openrouter/free, model discovery,
  pricing, providers, batch jobs, or structured JSON responses.
---

# openrouter

One API for hundreds of models. Prefer live catalog data over memory; model IDs and prices change.

## Core Principles

- Resolve informal names with `scripts/resolve-model.ts` before coding against a slug.
- Prefer a concrete model when quality, cost, or providers must be fixed. Use `openrouter/auto` when the task type varies. Use `openrouter/free` only for zero-cost experiments.
- Singular `model` picks one slug (or router). Plural `models: [...]` is the fallback chain — different field, different behavior.
- Pay the selected model's rate for routers — no router surcharge. Default auto cost band is roughly `low` if unset.
- Send `HTTP-Referer` and `X-Title` on app requests (OpenRouter app attribution). Opt in to routing visibility with `X-OpenRouter-Metadata: enabled`. Cache hits omit metadata.
- Filter for capabilities (`tools`, `structured_outputs`, modalities) before picking a model; pin with `provider.require_parameters` when the feature is mandatory.
- Batch is for async bulk work (24h window, ~50% token pricing). Sync API for streaming, multimodal base64, and OpenRouter-orchestrated web search.

## When to Use

- Pick, compare, or price models on OpenRouter
- Wire `openrouter/auto`, `openrouter/free`, fallbacks, or provider prefs
- Structured JSON (`response_format` / `json_schema`)
- Submit or poll Batch API jobs
- Debug which model/provider actually served a request

## When NOT to Use

- Non-OpenRouter providers or local-only inference
- Model vibe-checks / launch-day evals → `model-bench`
- Deep product research unrelated to OpenRouter APIs

## Implementation Guide

1. **Auth:** `OPENROUTER_API_KEY` from https://openrouter.ai/keys — required for chat/batch; optional for most model list scripts; required for `get-endpoints.ts`.
2. **Discover models:** from **this skill’s** `scripts/` directory, run `npm install` once, then follow [references/models-scripts.md](references/models-scripts.md). Or `GET https://openrouter.ai/api/v1/models` with filters (`sort`, `supported_parameters`, `output_modalities`).
3. **Route the request:**
   - Fixed slug: resolve live, then set `model`
   - Auto: `model: "openrouter/auto"` + optional `plugins: [{ id: "auto-router", cost_tier, allowed_models, excluded_models }]`
   - Free pool: `model: "openrouter/free"` (or `slug:free` for a specific free variant)
   - Fallbacks: `models: ["primary", "backup", ...]` — not the `model` field
   - Multi-turn auto: pass `session_id` (or rely on message fingerprint) for model/provider stickiness
4. **Structured outputs:** `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`. Confirm `structured_outputs` on the model; use `require_parameters: true` to avoid unsupported endpoints. Non-streaming can use response-healing plugin.
5. **Observe:** header `X-OpenRouter-Metadata: enabled` → `openrouter_metadata` (strategy, endpoints, attempts, pipeline). Auto task type lives at `pipeline` stage data `task_type`.
6. **Batch:** see [references/batch.md](references/batch.md). JSON key order: `endpoint`, `model`, `provider?`, then `requests`.

Minimal auto + metadata pattern (agents get this wrong without the header + plugin id):

```bash
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "HTTP-Referer: https://your-app.example" \
  -H "X-Title: Your App" \
  -H "Content-Type: application/json" \
  -H "X-OpenRouter-Metadata: enabled" \
  -d '{
    "model": "openrouter/auto",
    "session_id": "conv-1",
    "plugins": [{"id": "auto-router", "cost_tier": "medium"}],
    "messages": [{"role": "user", "content": "Refactor this function for clarity"}]
  }'
```

## Review Checklist

- [ ] Model ID resolved from live catalog, not memorized
- [ ] Required params present in `supported_parameters` (or `require_parameters`)
- [ ] Router choice matches constraint needs (fixed vs auto vs free)
- [ ] `model` vs `models` (fallback array) used correctly
- [ ] Metadata enabled when debugging routing
- [ ] Batch vs sync chosen for latency/modalities correctly

## References

- [references/models-scripts.md](references/models-scripts.md) — official discovery scripts
- [references/routing.md](references/routing.md) — auto, free, fallbacks, metadata
- [references/batch.md](references/batch.md) — Batch API gotchas
- Docs: [Models](https://openrouter.ai/docs/guides/overview/models), [Auto](https://openrouter.ai/docs/guides/routing/routers/auto-router), [Free](https://openrouter.ai/docs/guides/routing/routers/free-router), [Structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), [Router metadata](https://openrouter.ai/docs/guides/features/router-metadata), [Batch](https://openrouter.ai/docs/batch-quickstart)
