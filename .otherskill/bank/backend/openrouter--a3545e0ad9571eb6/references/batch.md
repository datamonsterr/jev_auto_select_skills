# Batch API

Docs: https://openrouter.ai/docs/batch-quickstart

Inline JSON `requests` array — no JSONL upload. One provider per batch. Completion window: `24h` only. Typical token discount ~50% of sync (non-token fees often full price). Filter models with [`?variant=batch`](https://openrouter.ai/models?variant=batch).

## Submit

`POST https://openrouter.ai/api/v1/batches`

Required top-level fields, **in this order** (stream parse; `requests` first → `400`):

1. `endpoint` — `/v1/chat/completions` \| `/v1/responses` \| `/v1/messages` \| `/v1/embeddings`
2. `model` — applied to every request (per-request `model` must match or omit)
3. `provider` (optional) — only `{ "only": ["provider-slug"] }` accepted
4. `requests` — `[{ custom_id, body }, ...]` (`custom_id` unique)

`202` + `status: "validating"` means accepted for validation, not finished.

## Lifecycle

`validating → in_progress → finalizing → completed` (also `failed` / `expired` / `cancelling` / `cancelled`).

- List: `GET /api/v1/batches` (workspace-scoped; `results` always null on list)
- Poll: `GET /api/v1/batches/:id` until terminal; completed batches return inline `results`
- Delete terminal batch: `DELETE /api/v1/batches/:id` (in-flight → `409`). Artifacts retained ~30 days otherwise.

## Hard limits (use sync instead)

- Images/files: **public https URLs only** — no base64 / `data:` / inline bytes. Provider support varies (see docs table).
- Audio/video input rejected. No `stream: true`. `:online` submit rejected.
- OpenRouter-orchestrated web search unavailable; some native provider search tools pass through.
- Google models: every request must share the same `response_format` / schema.

Pin a capable provider with `provider.only` when sending multimodal URLs.
