# TODO

## Done

- Next.js static dashboard with Tailwind and Base UI
- Fictional `public/routines.json` (18 routines) and JSON schema
- Overview stats, 7-day cron timeline, per-second countdowns
- Filters, search, plain-language cron text, detail drawer
- Chinese / English UI, default Chinese
- Configurable JSON URL with sample fallback
- New-routine badge, export time, stale-data warning
- Optional front-end passphrase for the static demo
- GitHub Actions workflow for the static demo at `/bot-routines-tracker`
- `scripts/export-routines.mjs` reads `AGENTS_ROOT/<agent>/profile.json` and `automations/*/automation.json`
- `scripts/export-and-upload.sh` publishes with `SYNC_TARGET` (`r2`, `file`, `http`, `blob`, `kv`, `netlify`)
- Worker serves `out/` and reads a private R2 object, or a private URL with a server-side token
- Node server (`server/index.mjs`) reads a private file, URL, Vercel Blob, KV, or Netlify Blobs
- README install prompt (Chinese and English) asks where to deploy and does not ask for an account id
- Optional GitHub Actions and Worker-cron examples for a non-Grok data source

## Next

- An admin still needs to turn on GitHub Pages for the static demo. The token used here cannot change that setting.
- In the repo: Settings → Pages → Build and deployment → Source: GitHub Actions.
- A private site is deployed by the reader's own bot via the install prompt. This repo does not ship a live bucket or blob.
