#!/usr/bin/env bash
# Export routines.json from AGENTS_ROOT and upload it to a private R2 bucket.
# Success prints nothing. Failures go to stderr and exit non-zero.
#
# Required:
#   AGENTS_ROOT   directory of agent folders (…/agents)
#   R2_BUCKET     private bucket name
# Optional:
#   R2_OBJECT_KEY object key (default: routines.json)
#   R2_CLI        wrangler (default) or cf
#   ROUTINES_TIMEZONE, STALE_AFTER_MINUTES  forwarded to the exporter

set -euo pipefail

if [[ -z "${AGENTS_ROOT:-}" ]]; then
  echo "Set AGENTS_ROOT to the agents directory." >&2
  exit 1
fi
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

root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp)"
err="$(mktemp)"
trap 'rm -f "$tmp" "$err"' EXIT

node "$root/scripts/export-routines.mjs" --root "$AGENTS_ROOT" --out "$tmp"

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
