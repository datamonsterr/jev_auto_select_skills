#!/usr/bin/env bash
# Compatibility entrypoint. No migration, removal, global link or .env copying.
set -euo pipefail
OTHERSKILL_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bun --no-env-file "$OTHERSKILL_REPO/otherskill.ts" setup "$@"
