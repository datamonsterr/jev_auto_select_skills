# Routing and observability

## Pick a router

| Slug | When |
| --- | --- |
| Concrete model ID via `model` | Quality, cost, or provider must be predictable |
| `openrouter/auto` | Task type varies; market-ranked by 7-day share-of-spend per ~30 task types |
| `openrouter/auto-beta` | Early-access auto; plugin id must be `auto-beta-router` |
| `openrouter/free` | Zero-cost random free model that supports required features |
| `models: [...]` | Explicit failover chain on errors (rate limit, downtime, moderation, context errors) |

**`model` vs `models`:** `model` is one slug (or router). `models` is an ordered fallback list. Do not confuse them. On Anthropic Messages, use `fallbacks: [{ model }]` (max 3) instead of combining with `models`.

Specific free model: append `:free`. Free pool has lower limits and uneven availability — not for production SLAs.

## Provider prefs (sync)

Common `provider` knobs: `order`, `allow_fallbacks`, `require_parameters`, `max_price` (filters endpoints after the router resolves models). Batch accepts only `provider.only`.

## Auto router settings

Send under `plugins` with `id: "auto-router"` (not the beta id):

- `cost_tier`: `low` \| `medium` \| `high` \| `xhigh` \| `max` (band, not a ceiling; unset ≈ `low`)
- `allowed_models` / `excluded_models`: wildcards (`anthropic/*`, `openai/gpt-5*`). Exclusions win. Empty match → `404`
- Deprecated: `cost_quality_tradeoff` (ignored if `cost_tier` set)

Requires `messages` (not bare `prompt`). Streaming and tools work with the selected model. You pay that model's price. Account defaults live on the workspace Routing page; request fields override unless "prevent overrides" is on.

**Session stickiness:** pass `session_id` (or message fingerprint) so multi-turn prefers the same model/provider while it remains a top candidate for the new task.

## Router metadata

Header: `X-OpenRouter-Metadata: enabled` (legacy: `X-OpenRouter-Experimental-Metadata`).

On success (and most opted-in errors): `openrouter_metadata` with `requested`, `strategy`, `region`, `summary`, `attempt`, `is_byok`, `endpoints`, optional `attempts` / `pipeline` / `params`.

- Streaming: metadata on the **final** chunk (or Anthropic `message_stop`)
- Cache hits: **no** metadata
- Auto task label: pipeline stage → `data.task_type`
- Decode permissively — new stage types appear without notice
- `500` errors omit metadata; prefer generation lookup via `X-Generation-Id` when needed

Also send `HTTP-Referer` and `X-Title` for [app attribution](https://openrouter.ai/docs/app-attribution).

## Structured outputs (routing note)

Support is **per endpoint**, not only per model. Set `response_format.type = json_schema` with `strict: true`, filter catalog by `supported_parameters=structured_outputs`, and set `provider.require_parameters: true` so unsupported providers are skipped. Optional [response healing](https://openrouter.ai/docs/guides/features/plugins/response-healing) for non-streaming JSON schema.
