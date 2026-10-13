#!/usr/bin/env bash
# Export routines.json from AGENTS_ROOT and publish it to a private store.
# Success prints nothing. Failures go to stderr and exit non-zero.
#
# Required:
#   AGENTS_ROOT    directory of agent folders (…/agents)
#   SYNC_TARGET    r2 (default), file, http, blob, kv, or netlify
# Target-specific:
#   r2       R2_BUCKET, optional R2_OBJECT_KEY and R2_CLI (wrangler or cf)
#   file     ROUTINES_FILE (outside public/ and out/)
#   http     ROUTINES_URL and ROUTINES_TOKEN
#   blob     BLOB_READ_WRITE_TOKEN and BLOB_STORE_ID
#   kv       KV_REST_API_URL and KV_REST_API_TOKEN
#   netlify  NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN (or NETLIFY_AUTH_TOKEN)
# Optional:
#   ROUTINES_OBJECT_KEY, ROUTINES_TIMEZONE, STALE_AFTER_MINUTES

set -euo pipefail

if [[ -z "${AGENTS_ROOT:-}" ]]; then
  echo "Set AGENTS_ROOT to the agents directory." >&2
  exit 1
fi

SYNC_TARGET="${SYNC_TARGET:-r2}"
case "$SYNC_TARGET" in
  r2|file|http|blob|kv|netlify) ;;
  *)
    echo "SYNC_TARGET must be r2, file, http, blob, kv, or netlify." >&2
    exit 1
    ;;
esac

if [[ "$SYNC_TARGET" == "r2" ]]; then
  if [[ -z "${R2_BUCKET:-}" ]]; then
    echo "Set R2_BUCKET to the private R2 bucket name." >&2
    exit 1
  fi
  R2_OBJECT_KEY="${R2_OBJECT_KEY:-routines.json}"
  R2_CLI="${R2_CLI:-wrangler}"
  if [[ ! "$R2_BUCKET" =~ ^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$ ]]; then
    echo "R2_BUCKET must be a lowercase bucket name." >&2
    exit 1
  fi
  if [[ "$R2_OBJECT_KEY" == /* || "$R2_OBJECT_KEY" == *".."* || -z "$R2_OBJECT_KEY" ]]; then
    echo "R2_OBJECT_KEY must be a relative object key." >&2
    exit 1
  fi
  if [[ "$R2_CLI" != "wrangler" && "$R2_CLI" != "cf" ]]; then
    echo "R2_CLI must be wrangler or cf." >&2
    exit 1
  fi
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp)"
err="$(mktemp)"
trap 'rm -f "$tmp" "$err"' EXIT

node "$root/scripts/export-routines.mjs" --root "$AGENTS_ROOT" --out "$tmp"

if [[ "$SYNC_TARGET" != "r2" ]]; then
  node "$root/scripts/publish-routines.mjs" "$tmp"
  exit 0
fi

if [[ "$R2_CLI" == "cf" ]]; then
  cli=(cf)
elif [[ -x "$root/node_modules/.bin/wrangler" ]]; then
  cli=("$root/node_modules/.bin/wrangler")
elif command -v wrangler >/dev/null 2>&1; then
  cli=(wrangler)
else
  cli=(npx --yes wrangler)
fi

# --remote writes to the account bucket. Without it, wrangler keeps the object locally.
# Stdout and stderr stay quiet on success so a sync routine does not announce a no-op.
if ! "${cli[@]}" r2 object put "${R2_BUCKET}/${R2_OBJECT_KEY}" \
  --file "$tmp" \
  --content-type application/json \
  --remote \
  >/dev/null 2>"$err"; then
  cat "$err" >&2
  exit 1
fi
