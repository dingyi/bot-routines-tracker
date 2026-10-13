# TODO

## Done

- Next.js static dashboard with Tailwind and Base UI
- Fictional `public/routines.json` (18 routines) and JSON schema
- Overview stats, 7-day cron timeline, per-second countdowns
- Filters, search, plain-language cron text, detail drawer
- Chinese / English UI, default Chinese
- Configurable JSON URL with sample fallback, export example script
- New-routine badge, export time, stale-data warning
- Optional front-end passphrase gate
- GitHub Actions workflow for GitHub Pages at `/bot-routines-tracker`

## Next

- An admin still needs to turn on GitHub Pages. The token used here cannot change that setting (`POST /repos/dingyi/bot-routines-tracker/pages` returns 403).
- In the repo: Settings → Pages → Build and deployment → Source: GitHub Actions.
- Then re-run the “Deploy to GitHub Pages” workflow on `main`. The build already passes; deploy fails with “Ensure GitHub Pages has been enabled” until that switch is on.
- After that, confirm https://dingyi.github.io/bot-routines-tracker/
