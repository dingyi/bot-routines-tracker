# Bot Routines Tracker

A dashboard template for scheduled bot routines. It shows overview stats, a 7-day timeline computed from cron expressions, live countdowns, and a detail drawer. Default language is Chinese. Switch to English from the header.

There are two ways to run it. They are not the same deployment.

| | Static demo | Private site |
| --- | --- | --- |
| What it shows | The fictional `public/routines.json` in this repo | Your bots' routines, from a private store |
| Host | GitHub Pages, or any static host | Cloudflare Workers (recommended), Vercel, Netlify, or your own server |
| Access | Optional browser passphrase, compiled into the JavaScript | `SITE_PASSWORD`, checked on the server |
| Updates | Only when you rebuild | A Grok Bot routine every 15 minutes runs the export and upload |

Cloudflare is one recommended option. It is not required. The static demo never receives your prompts. A private store is never published.

### Where the JSON lives

The page always reads same-origin `/routines.json`. On a private site the server reads the store, then returns the document only after the passphrase matches. Pick one store. If more than one is configured, set `FEED_SOURCE`.

| Store | Where it fits | How it stays private |
| --- | --- | --- |
| Private R2 | Cloudflare Workers, the recommended pairing | Bucket binding. Leave public access and r2.dev off |
| Private Blob | Vercel | Server reads `https://<store-id>.private.blob.vercel-storage.com` with a bearer token |
| Netlify Blobs | Netlify | Site token on the server. `npm install @netlify/blobs` |
| KV | Vercel KV, Upstash, or any host that can call the REST API | `POST` a JSON command. The document is the body, not the URL |
| Private file | Your own server | A path outside `public/` and `out/`, mode `0600` |
| Private JSON URL | Any host that runs the server | `GET` with `Authorization: Bearer`. Redirects are refused so the token is not forwarded |

GitHub Pages and other static hosts cannot hold this file. They serve the fictional demo only.

Tokens and `SITE_PASSWORD` stay in server environment variables. Do not prefix them with `NEXT_PUBLIC_`, commit them, or put them in the sync routine's instructions.

![Overview of the dashboard in Chinese, with stats, the next-run countdown, a 7-day timeline, and the routine list](docs/screenshots/overview.png)

## Screenshots

| Overview | Detail drawer |
| --- | --- |
| ![Overview](docs/screenshots/overview.png) | ![Detail drawer with the prompt and raw trigger JSON](docs/screenshots/drawer.png) |

English UI:

![The same dashboard after switching the language to English](docs/screenshots/english.png)

Narrow screen:

![The dashboard on a phone-width viewport](docs/screenshots/mobile.png)

## Quick start (static demo)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The page loads `public/routines.json`.

```bash
npm test
npm run lint
npm run build
```

`npm run build` writes a static site to `out/`.

## Install prompt

Copy the block below into your own Grok Bot. You do not fill in an account id. The bot asks where you want the site, then uses the login you already have on that platform.

Security, before you paste:

- Private data must not be exposed publicly. No public buckets, no r2.dev URL, no public Blob, no public KV, and no real `routines.json` on a static host.
- Prompts inside `automation.json` can be private. The bot should not print them, commit them, or paste them back into chat.
- The bot generates `SITE_PASSWORD` and tells you once. That value does not belong in git, in `wrangler.jsonc`, or in the sync routine's instructions.

```text
You are setting up bot-routines-tracker. Do this on your own computer. Do not open or merge a pull request. Do not publish private routines data.

Repository: https://github.com/dingyi/bot-routines-tracker

Before you clone or create anything, ask me where to deploy. Wait for my answer. Offer only these choices unless I name another host I already use:
1. Cloudflare Workers + R2 (recommended)
2. Vercel
3. Netlify
4. GitHub Pages, or any static host
5. My own server

Use the login and account I already have on that platform. Do not ask me for a Cloudflare account id, a Vercel team id, a Netlify account id, or any other account id. If the CLI is not logged in, start its normal login (`npx wrangler login`, `vercel login`, `netlify login`, or `gh auth login`) and keep the account that login selects. Do not switch accounts.

Ask me for a site name only when that host needs one (lowercase letters, numbers, hyphens). If I skip it, pick a name and tell me what you used.

Security on every path:
- Private data must not be exposed publicly. No public buckets, no r2.dev URL, no public Blob, no public KV, no token in the browser, and no routines.json committed or uploaded to a static host.
- automation.json prompts may contain private information. Do not print them, commit them, or quote them in chat.
- Generate SITE_PASSWORD yourself from a CSPRNG (at least 24 bytes, for example `openssl rand -base64 24`). Tell me that password once in the final report. Do not write it into the repo, wrangler.jsonc, a committed env file, or the sync routine's instructions.
- The sync command stays quiet on success.

Then follow exactly one path.

Path A — Cloudflare Workers + R2 (recommended):
1. Clone the repository (for example into ~/bot-routines-tracker) and run `npm ci`.
2. Use the Cloudflare CLI that is already logged in (`npx wrangler whoami`, or the `cf` CLI if that is what this machine uses for Cloudflare). Do not pick a different account. Set R2_CLI=cf only when that authenticated CLI is `cf`.
3. Create a private R2 bucket. Name it from the site name plus "-routines". If it already exists, reuse it. Do not turn on public access and do not enable r2.dev.
4. In wrangler.jsonc set "name" to the site name and the ROUTINES_BUCKET bucket_name to that bucket. Leave the binding name ROUTINES_BUCKET unchanged. Leave ROUTINES_URL empty so the Worker reads R2.
5. Put the generated password in the Worker secret SITE_PASSWORD (`printf '%s' "$SITE_PASSWORD" | npx wrangler secret put SITE_PASSWORD`). Do not write it into a file in the repo.
6. Build for the domain root, with PAGES_BASE_PATH empty: `PAGES_BASE_PATH= npm run build`
7. Deploy: `npx wrangler deploy` (or the matching `cf` deploy if that is the CLI you authenticated). This Worker is the site. It is not the GitHub Pages demo.
8. Export and upload once. Export R2_BUCKET as the bucket name from step 3, then run:
   AGENTS_ROOT=/home/box/agent-data/agents SYNC_TARGET=r2 R2_OBJECT_KEY=routines.json bash scripts/export-and-upload.sh
   Add R2_CLI=cf when you are using the cf CLI. The command must exit 0 and print nothing on success.
9. Create the 15-minute routine described below.
10. Verify GET /api/auth returns JSON with "mode":"worker", and GET /routines.json without a session cookie returns 401. Report the site URL and the SITE_PASSWORD. Do not report the contents of routines.json.

Path B — Vercel:
1. Clone the repository and run `npm ci`.
2. Use the Vercel CLI that is already logged in (`vercel whoami`). Do not ask me for a team id or account id. Link the project with that login.
3. Store the JSON in one private place:
   - Private Vercel Blob: create a private store with the logged-in CLI. Set BLOB_READ_WRITE_TOKEN and BLOB_STORE_ID as server env. SYNC_TARGET=blob and FEED_SOURCE=blob. Reads must use the private blob host for that store id (the host label, then .private.blob.vercel-storage.com) and must reject a public blob host.
   - Or a private URL that already requires a token: set ROUTINES_URL and ROUTINES_TOKEN, SYNC_TARGET=http, FEED_SOURCE=url.
4. Set SITE_PASSWORD in the project env. Do not set NEXT_PUBLIC_ variables for the token or the password.
5. This app is a static export plus a Node server. If Vercel would publish it as a Next.js static site, switch the framework preset to Other so the start command is `node server/index.mjs`. Build with PAGES_BASE_PATH empty: `PAGES_BASE_PATH= npm run build`
6. Deploy with `vercel deploy --prod` using the existing login.
7. Run the export once from the clone directory with the same SYNC_TARGET. Success prints nothing.
8. Create the 15-minute routine described below.
9. Verify GET /api/auth returns "mode":"server", and GET /routines.json without a cookie returns 401. If /api/auth is 404, the Node server is not running; fix the preset and deploy again. Report the URL and SITE_PASSWORD. Do not report routines.json.

Path C — Netlify:
1. Clone the repository and run `npm ci`.
2. Use the Netlify CLI that is already logged in (`netlify status`). Do not ask me for an account id.
3. Store the JSON in Netlify Blobs, or in a private URL plus token. For Blobs: `npm install @netlify/blobs`, then set NETLIFY_SITE_ID, NETLIFY_BLOBS_TOKEN (or NETLIFY_AUTH_TOKEN), ROUTINES_NETLIFY_STORE=routines, FEED_SOURCE=netlify, and SYNC_TARGET=netlify. Do not enable a public blob store. For a private URL, use the same FEED_SOURCE=url and SYNC_TARGET=http settings as on Vercel.
4. Set SITE_PASSWORD. Build with PAGES_BASE_PATH empty.
5. Deploy with the logged-in CLI so the running process is `node server/index.mjs`, not a purely static publish of out/.
6. Export once, then create the 15-minute routine described below.
7. Verify mode "server" and a 401 without a cookie. Report the URL and SITE_PASSWORD. Do not report routines.json.

Path D — GitHub Pages or any static host:
This host cannot hold private JSON. Deploy the fictional demo only. Do not upload a real routines.json, do not commit prompts, and do not put a token in the site.
1. Clone the repository and run `npm ci`.
2. For GitHub Pages, use the logged-in `gh` CLI and the workflow already in .github/workflows/pages.yml. Enable Pages source GitHub Actions if I have permission. Do not invent an account id.
3. For any other static host, run `PAGES_BASE_PATH= npm run build` when the site is at the domain root, or set the subpath, and upload only `out/`.
4. Tell me the demo URL and say clearly that it shows fictional sample data. Offer Cloudflare, Vercel, Netlify, or my own server if I want my private routines. Do not create the sync routine on this path.

Path E — My own server:
1. Clone the repository and run `npm ci`. Build with PAGES_BASE_PATH empty.
2. Pick one private store and set FEED_SOURCE:
   - A file outside this repo's public/ and out/ directories: ROUTINES_FILE and SYNC_TARGET=file. The server refuses to write the sample tree.
   - KV (Upstash or Vercel KV REST): KV_REST_API_URL and KV_REST_API_TOKEN, SYNC_TARGET=kv. The JSON goes in the POST body, not the URL.
   - A private JSON endpoint: ROUTINES_URL (https) and ROUTINES_TOKEN, SYNC_TARGET=http. The server sends the token and refuses redirects.
3. Set SITE_PASSWORD. Start with `node server/index.mjs`. It binds 127.0.0.1:8788 unless I asked for another interface. Do not bind a public interface without SITE_PASSWORD.
4. Put TLS in front of it if I want it on the public internet. Do not commit the env file.
5. Export once, then create the 15-minute routine described below.
6. Verify mode "server" and a 401 without a cookie. Report the URL and SITE_PASSWORD. Do not report routines.json.

15-minute routine (paths A, B, C, and E only):
Create a routine on this bot, cron `*/15 * * * *`, whose only job is to run the same export command from the clone directory, with the same SYNC_TARGET.
- On success, stay silent. Send me no message.
- Do not start nohup, a background loop, or any other always-on process. Those pause when I close the app. This routine is the scheduler.
- On failure, append one line with the exit code to ~/bot-routines-sync-failures. Do not write routines JSON or prompts into that file. When the file reaches two lines, tell me the sync failed twice in a row and include the last exit code, then delete the file. A later success deletes the file and stays silent.
```

## What you get

- Counts for routines, enabled, paused, cron, webhook, and runs in the next 24 hours
- A 7-day timeline in a time zone you can change (default `Asia/Shanghai`)
- A per-second countdown to the next enabled cron run, and one on each scheduled row
- Plain-language cron text in the current UI language
- Filters for bot, status, and trigger type, plus search across names, bots, and prompts
- A drawer with the full prompt rendered as Markdown and the original trigger JSON
- A **新 / New** badge on routines that show up while the page is polling
- Export time, last fetch time, and a stale-data warning
- Chinese and English UI copy

The page refetches about every 45 seconds. Change `POLL_INTERVAL_MS` in `lib/preferences.ts` if you want a different interval.

On a private site, the header says the data is synced. The static demo says it is the sample.

## Data format

The file is a single JSON object. Version `1` is the only supported version. A copy of the schema lives in [`schema/routines.schema.json`](schema/routines.schema.json). The sample file is [`public/routines.json`](public/routines.json).

| Field | Required | Meaning |
| --- | --- | --- |
| `version` | no | `1`. Omit it or set it to 1. |
| `exportedAt` | recommended | ISO-8601 time the file was produced. Drives the “exported” clock and the stale warning. |
| `timezone` | no | IANA zone for cron routines that do not set their own. Default `Asia/Shanghai`. |
| `staleAfterMinutes` | no | Warn when `exportedAt` is older than this. Default 720 (12 hours). The sample uses 180. A 15-minute sync uses 45. |
| `routines` | yes | Array of routine objects. |

Each routine needs `id`, `name`, `bot`, `status` (`enabled` or `paused`), `prompt` (Markdown), and `trigger`. `summary` and `updatedAt` are optional.

A cron trigger:

```json
{ "type": "cron", "expression": "15 8 * * 1-5", "timezone": "Asia/Shanghai" }
```

`expression` is a standard 5-field cron (`minute hour day-of-month month day-of-week`). `timezone` is optional and overrides the file zone. The timeline still draws those instants in the zone selected in the header.

A webhook trigger has no schedule. It appears in the list, not on the timeline:

```json
{ "type": "webhook", "path": "/hooks/example", "description": "Called by an example form." }
```

Rows that fail validation are skipped and listed on the page. The rest of the file still loads.

### Exporting Grok Bot routines

[`scripts/export-routines.mjs`](scripts/export-routines.mjs) reads the bot computer:

- `AGENTS_ROOT/<agent>/profile.json` for the bot name (`name`, `displayName`, or `title`)
- `AGENTS_ROOT/<agent>/automations/<routine>/automation.json` for each routine

`AGENTS_ROOT` is `/home/box/agent-data/agents` on a Grok Bot computer. Cron triggers (`type`/`kind` of `cron`, or a top-level `cron` string) become cron rows. Webhook, Slack, GitHub, and other event triggers become webhook rows. Paused, disabled, and `enabled: false` stay paused. Fields whose names look like tokens are left out of the trigger JSON. The script does not call the network.

[`scripts/export-and-upload.sh`](scripts/export-and-upload.sh) writes that file and publishes it. It prints nothing when the publish works. `SYNC_TARGET` defaults to `r2`, which keeps the Cloudflare path. Other targets call [`scripts/publish-routines.mjs`](scripts/publish-routines.mjs).

```bash
AGENTS_ROOT=/home/box/agent-data/agents \
SYNC_TARGET=r2 \
R2_BUCKET=your-private-bucket \
R2_OBJECT_KEY=routines.json \
bash scripts/export-and-upload.sh
```

| Variable | Required | Meaning |
| --- | --- | --- |
| `AGENTS_ROOT` | yes | Agent directory |
| `SYNC_TARGET` | no | `r2` (default), `file`, `http`, `blob`, `kv`, or `netlify` |
| `R2_BUCKET` | for `r2` | Private bucket name |
| `R2_OBJECT_KEY` | no | R2 object key. Default `routines.json` |
| `R2_CLI` | no | `wrangler` (default) or `cf`. Set `cf` only when that is the Cloudflare CLI you logged in |
| `ROUTINES_FILE` | for `file` | Absolute path outside `public/` and `out/` |
| `ROUTINES_URL`, `ROUTINES_TOKEN` | for `http` | Private https URL and bearer token |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID` | for `blob` | Private Vercel Blob |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | for `kv` | Upstash-compatible REST |
| `NETLIFY_SITE_ID`, `NETLIFY_BLOBS_TOKEN` | for `netlify` | Netlify Blobs. `NETLIFY_AUTH_TOKEN` works in place of the blobs token |
| `ROUTINES_OBJECT_KEY` | no | Key for blob, KV, and Netlify. Default `routines.json` |
| `ROUTINES_TIMEZONE` | no | File time zone. Default `Asia/Shanghai` |
| `STALE_AFTER_MINUTES` | no | Stale threshold. Default `45` |

The R2 upload uses `wrangler r2 object put --remote`, or the same subcommand via the `cf` CLI when `R2_CLI=cf`. `--remote` is required so the object lands in the account bucket. The script does not look for a `cf` binary on its own, because that name is also the Cloud Foundry CLI.

`file`, `http`, `blob`, `kv`, and `netlify` never make the store public. `http` sends `PUT` with the bearer token and refuses redirects. Blob uploads set `x-vercel-blob-access: private` and fail if the stored URL is on the public blob host. KV sends `POST` with a JSON command array, so the document is not placed in the URL.

A `nohup` loop on the bot computer pauses when the app closes, so the sync stops. The install prompt schedules a server-side routine instead. That routine wakes the bot, runs the script, and stays quiet when the upload succeeds.

For a scheduler that is not Grok Bot, [`scripts/export-routines.example.mjs`](scripts/export-routines.example.mjs) maps your own job list into the same JSON. Two optional examples live in [`docs/examples/github-actions-sync.yml`](docs/examples/github-actions-sync.yml) and [`docs/examples/cloudflare-cron.mjs`](docs/examples/cloudflare-cron.mjs). Copy them only when the data source is reachable from that runner. Leave them off for a Grok Bot deployment. Neither example makes the bucket public.

To load a file hosted somewhere else in the static demo, open **数据设置 / Data settings** and paste the URL, or open `/?data=https://example.com/routines.json`. The host must send CORS headers that allow the browser to read the JSON. If that request fails on first load, the page falls back to the bundled sample and says so.

Do not commit private prompts. The sample in this repo is fiction: invented bot names, generic instructions, and no real accounts.

## Deploy

### Static demo: GitHub Pages

This path serves the fictional sample. It does not connect to a private store.

This repository includes [`.github/workflows/pages.yml`](.github/workflows/pages.yml). On every push to `main` it runs the tests, builds with `PAGES_BASE_PATH=/bot-routines-tracker`, and deploys the `out/` folder with GitHub Actions.

One-time setup:

1. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. Push to `main`.

The demo is then at `https://dingyi.github.io/bot-routines-tracker/`.

If you fork the repo and the repository name is different, change `PAGES_BASE_PATH` in the workflow to `/your-repo-name`.

Any other static host works the same way. Build with `PAGES_BASE_PATH` empty for a root domain, or set to the subpath, and upload `out/`. `public/.nojekyll` is included so a host that runs Jekyll does not drop the `_next` folder.

### Private data

Cloudflare Workers + R2 is the recommended private path. Vercel, Netlify, and your own server use the same page with [`server/index.mjs`](server/index.mjs). That process serves `out/` and reads whichever store `FEED_SOURCE` selects (or the only store you configured). `GET /routines.json` on that server returns the private document only with the session cookie.

A Cloudflare Worker does the same job when you deploy [`wrangler.jsonc`](wrangler.jsonc). It serves `out/` and, unless `ROUTINES_URL` is set, reads `routines.json` from the `ROUTINES_BUCKET` binding. `run_worker_first` covers `/api/*` and `/routines.json`, so the fictional sample inside `out/` is not what visitors receive. Set `ROUTINES_URL` and `ROUTINES_TOKEN` with `wrangler secret put` when this Worker should fetch a private URL instead of R2. Empty vars in the config are overridden by those secrets. Leave them empty for the R2 path.

- Build with `PAGES_BASE_PATH` empty. The site is mounted at the domain root.
- On Cloudflare, create the bucket with `wrangler r2 bucket create`. Leave public access off. Set `SITE_PASSWORD` with `wrangler secret put`. It is listed under `secrets.required` and is not a var. `npx wrangler deploy` publishes the Worker and the assets together.
- On Vercel or Netlify, the start command is `node server/index.mjs`. A static-only publish will not serve `/api/auth`.
- On your own server, `npm start` binds `127.0.0.1:8788`. Binding any other interface without `SITE_PASSWORD` exits. A private feed without `SITE_PASSWORD` also exits.

`GET /api/auth` returns `"mode":"worker"` on Cloudflare and `"mode":"server"` on the Node server. The page treats both as a server passphrase. `POST /api/session` sets an HttpOnly cookie after a constant-time check. `GET /routines.json` tells the browser not to cache it. Until the secret is set, the private document is refused.

The page still works as a static demo where `/api/auth` does not exist. It then uses the optional front-end gate below, or no gate at all.

## Password

Static demo: `NEXT_PUBLIC_GATE_PASSWORD` is optional. When it is set at **build** time, the page asks for that passphrase and remembers it in `sessionStorage`. The value is compiled into the JavaScript bundle. See [`.env.example`](.env.example). Use it only as a speed bump on the fictional sample.

Private site: `SITE_PASSWORD` stays on the server that hosts the site. The browser never receives the expected value, only a cookie after a match. Losing the password means setting a new secret. It does not mean editing the site.

## 中文

这个模板有两种跑法，不要混在一起。

| | 静态演示 | 私有站点 |
| --- | --- | --- |
| 看到的数据 | 仓库里虚构的 `public/routines.json` | 你自己机器人的例行任务，从私有存储读取 |
| 托管 | GitHub Pages，或任何静态空间 | Cloudflare Workers（推荐）、Vercel、Netlify，或你自己的服务器 |
| 访问 | 可选的浏览器口令，会写进 JS | 服务器上的 `SITE_PASSWORD` |
| 更新 | 只有重新构建才会变 | Grok Bot 每 15 分钟跑一次导出并上传 |

Cloudflare 是推荐选项之一，不是必须。静态演示不会收到你的提示词。私有存储不会被公开。

### 数据放在哪里

页面始终读取同源的 `/routines.json`。私有站点由服务器读取存储，口令核对通过之后才返回文档。只选一种存储。配置了多于一种时，设置 `FEED_SOURCE`。

| 存储 | 适合放在 | 怎样保持私有 |
| --- | --- | --- |
| 私有 R2 | Cloudflare Workers，推荐的搭配 | 存储桶绑定。不要打开公开访问，也不要打开 r2.dev |
| 私有 Blob | Vercel | 服务器用令牌读取 `https://<store-id>.private.blob.vercel-storage.com` |
| Netlify Blobs | Netlify | 站点令牌留在服务器。需要 `npm install @netlify/blobs` |
| KV | Vercel KV、Upstash，或任何能调用 REST 的主机 | `POST` 一条 JSON 命令。文档在请求体里，不在网址里 |
| 私有文件 | 你自己的服务器 | 路径在 `public/` 和 `out/` 之外，权限 `0600` |
| 私有 JSON 网址 | 任何会跑这个服务器的主机 | `GET` 时带 `Authorization: Bearer`。拒绝重定向，避免把令牌转发出去 |

GitHub Pages 和其他静态空间放不下这份文件。它们只提供虚构演示。

令牌和 `SITE_PASSWORD` 只放在服务器环境变量里。不要加 `NEXT_PUBLIC_` 前缀，不要提交，也不要写进同步例程的指令。

界面默认中文，页头可以改成英文。本地看演示：

```bash
npm install
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。`npm run build` 的静态文件在 `out/`。

### 一键安装提示词

把下面整段复制给你自己的 Grok Bot。你不用填写账号 ID。机器人会先问你想把站点放在哪里，然后使用你在那个平台上已经登录的账号。

粘贴之前：

- 私有数据不能公开。不要打开公开存储桶、r2.dev、公开 Blob、公开 KV，也不要把真实的 `routines.json` 放到静态空间。
- `automation.json` 里的提示词可能是私密的。机器人不应打印、提交或贴回对话。
- 口令由机器人生成，只在最后告诉你一次。不要写进 git、`wrangler.jsonc`，或同步例程的指令里。

```text
请在你自己的电脑上安装 bot-routines-tracker。不要开 pull request，也不要合并。不要发布私有的例行任务数据。

仓库：https://github.com/dingyi/bot-routines-tracker

在克隆或创建任何资源之前，先问我要部署到哪里。等我回答。除非我另外指定一个我已经在用的主机，否则只提供这些选项：
1. Cloudflare Workers + R2（推荐）
2. Vercel
3. Netlify
4. GitHub Pages，或任何静态空间
5. 我自己的服务器

使用我在该平台上已经登录的账号。不要向我索要 Cloudflare 账号 ID、Vercel team id、Netlify 账号 ID，或任何其他账号 ID。如果 CLI 还没登录，就走它自己的登录命令（`npx wrangler login`、`vercel login`、`netlify login` 或 `gh auth login`），并沿用这次登录选中的账号。不要切换账号。

只有这个主机需要站点名时才问我（小写字母、数字、连字符）。如果我跳过，你自己取一个名字，并在报告里告诉我。

每条路径都要遵守：
- 私有数据不能公开。不要打开公开存储桶、r2.dev、公开 Blob、公开 KV，不要把令牌放进浏览器，也不要把 routines.json 提交或上传到静态空间。
- automation.json 里的提示词可能包含私人信息。不要打印、提交，也不要在对话里引用原文。
- SITE_PASSWORD 用密码学安全的随机数自己生成（至少 24 字节，例如 `openssl rand -base64 24`）。只在最后的报告里告诉我一次。不要写进仓库、wrangler.jsonc、会提交的 env 文件，或同步例程的指令。
- 同步命令成功时不打印。

然后只走其中一条路径。

路径 A — Cloudflare Workers + R2（推荐）：
1. 克隆仓库（例如到 ~/bot-routines-tracker），执行 `npm ci`。
2. 使用这台机器上已经登录的 Cloudflare CLI（`npx wrangler whoami`；如果这台机器用 `cf` 管理 Cloudflare，就用它）。不要换账号。只有已登录的 CLI 确实是 `cf` 时才设置 R2_CLI=cf。
3. 创建一个私有 R2 存储桶。名字用站点名加上 "-routines"。已经存在就沿用。不要改成公开，不要打开 r2.dev。
4. 在 wrangler.jsonc 里把 "name" 改成站点名，把 ROUTINES_BUCKET 的 bucket_name 改成这个存储桶。绑定名 ROUTINES_BUCKET 不要改。ROUTINES_URL 留空，这样 Worker 读取的是 R2。
5. 把生成的口令设为 Worker 密钥 SITE_PASSWORD（`printf '%s' "$SITE_PASSWORD" | npx wrangler secret put SITE_PASSWORD`）。不要写进仓库里的文件。
6. 按域名根构建，PAGES_BASE_PATH 留空：`PAGES_BASE_PATH= npm run build`
7. 部署：`npx wrangler deploy`（如果你认证的是 `cf`，就用对应的 deploy）。这个 Worker 才是站点，不是 GitHub Pages 上的演示。
8. 导出并上传一次。先把 R2_BUCKET 设为第 3 步的存储桶名，再运行：
   AGENTS_ROOT=/home/box/agent-data/agents SYNC_TARGET=r2 R2_OBJECT_KEY=routines.json bash scripts/export-and-upload.sh
   使用 `cf` CLI 时加上 `R2_CLI=cf`。命令必须退出码为 0，成功时不打印内容。
9. 按下面的说明创建每 15 分钟的例程。
10. 确认 GET /api/auth 返回的 JSON 里有 "mode":"worker"，不带会话 cookie 的 GET /routines.json 返回 401。向我报告站点网址和 SITE_PASSWORD。不要报告 routines.json 的内容。

路径 B — Vercel：
1. 克隆仓库并执行 `npm ci`。
2. 使用已经登录的 Vercel CLI（`vercel whoami`）。不要向我索要 team id 或账号 ID。用这次登录把项目连上。
3. 把 JSON 放在一个私有位置：
   - 私有 Vercel Blob：用已登录的 CLI 创建一个私有 store。把 BLOB_READ_WRITE_TOKEN 和 BLOB_STORE_ID 设为服务器环境变量。SYNC_TARGET=blob，FEED_SOURCE=blob。读取必须走该 store id 对应的私有 blob 主机（主机名标签加上 .private.blob.vercel-storage.com）。如果结果落在公开 blob 主机上就失败。
   - 或者一个本来就需要令牌的私有网址：设置 ROUTINES_URL 和 ROUTINES_TOKEN，SYNC_TARGET=http，FEED_SOURCE=url。
4. 在项目环境变量里设置 SITE_PASSWORD。不要给令牌或口令加 NEXT_PUBLIC_ 前缀。
5. 这个应用是静态导出加一个 Node 服务器。如果 Vercel 会把它当成 Next.js 静态站点发布，把框架预设改成 Other，启动命令用 `node server/index.mjs`。按域名根构建：`PAGES_BASE_PATH= npm run build`
6. 用现有登录执行 `vercel deploy --prod`。
7. 在克隆目录里用同一个 SYNC_TARGET 导出一次。成功时不打印。
8. 按下面的说明创建每 15 分钟的例程。
9. 确认 GET /api/auth 返回 "mode":"server"，不带 cookie 的 GET /routines.json 返回 401。如果 /api/auth 是 404，说明 Node 服务器没在跑，改好预设再部署。向我报告网址和 SITE_PASSWORD。不要报告 routines.json。

路径 C — Netlify：
1. 克隆仓库并执行 `npm ci`。
2. 使用已经登录的 Netlify CLI（`netlify status`）。不要向我索要账号 ID。
3. 把 JSON 放进 Netlify Blobs，或放进私有网址加令牌。Blobs：先 `npm install @netlify/blobs`，再设置 NETLIFY_SITE_ID、NETLIFY_BLOBS_TOKEN（或 NETLIFY_AUTH_TOKEN）、ROUTINES_NETLIFY_STORE=routines、FEED_SOURCE=netlify、SYNC_TARGET=netlify。不要打开公开 blob。私有网址则和 Vercel 一样使用 FEED_SOURCE=url 与 SYNC_TARGET=http。
4. 设置 SITE_PASSWORD。构建时 PAGES_BASE_PATH 留空。
5. 用已登录的 CLI 部署，让运行的进程是 `node server/index.mjs`，而不是只把 out/ 当静态站点发布。
6. 导出一次，再按下面的说明创建每 15 分钟的例程。
7. 确认 mode 为 "server"，不带 cookie 时返回 401。向我报告网址和 SITE_PASSWORD。不要报告 routines.json。

路径 D — GitHub Pages 或任何静态空间：
这种主机放不下私有 JSON。只部署虚构演示。不要上传真实的 routines.json，不要提交提示词，也不要把令牌放进站点。
1. 克隆仓库并执行 `npm ci`。
2. GitHub Pages 使用已经登录的 `gh` CLI，以及仓库里的 .github/workflows/pages.yml。如果我有权限，把 Pages 的 Source 设为 GitHub Actions。不要编造账号 ID。
3. 其他静态空间：站点在域名根上时执行 `PAGES_BASE_PATH= npm run build`，挂在子路径上就设置对应的 PAGES_BASE_PATH，然后只上传 `out/`。
4. 告诉我演示网址，并写明它展示的是虚构示例。如果我要看自己的私有例行任务，再提议改用 Cloudflare、Vercel、Netlify 或我自己的服务器。这条路径不要创建同步例程。

路径 E — 我自己的服务器：
1. 克隆仓库并执行 `npm ci`。构建时 PAGES_BASE_PATH 留空。
2. 选一种私有存储并设置 FEED_SOURCE：
   - 文件放在本仓库的 public/ 和 out/ 之外：ROUTINES_FILE，SYNC_TARGET=file。服务器会拒绝写入示例站点目录。
   - KV（Upstash 或 Vercel KV REST）：KV_REST_API_URL 和 KV_REST_API_TOKEN，SYNC_TARGET=kv。JSON 放在 POST 正文里，不要放进网址。
   - 私有 JSON 接口：ROUTINES_URL（https）和 ROUTINES_TOKEN，SYNC_TARGET=http。服务器发送令牌，并拒绝重定向。
3. 设置 SITE_PASSWORD。用 `node server/index.mjs` 启动。除非我要求别的网卡，否则绑定 127.0.0.1:8788。没有 SITE_PASSWORD 时不要绑定到公网网卡。
4. 如果要放到公网，前面加 TLS。不要提交 env 文件。
5. 导出一次，再按下面的说明创建每 15 分钟的例程。
6. 确认 mode 为 "server"，不带 cookie 时返回 401。向我报告网址和 SITE_PASSWORD。不要报告 routines.json。

每 15 分钟的例程（只用于路径 A、B、C、E）：
在这个机器人上创建一个例程，cron 为 `*/15 * * * *`，唯一的工作是在克隆目录里再跑一遍同一条导出命令，并带上同一个 SYNC_TARGET。
- 成功就保持沉默，不要给我发消息。
- 不要用 nohup、后台循环或其他常驻进程。我关掉应用后那些进程会暂停。这个例程才是调度器。
- 失败时往 ~/bot-routines-sync-failures 追加一行退出码。不要把 routines JSON 或提示词写进这个文件。文件凑满两行时，告诉我连续失败了两次，并带上最后一次退出码，然后删掉文件。之后一旦成功，删掉文件并继续保持沉默。
```

### 数据格式

根对象里最重要的是 `routines` 数组。建议同时写上 `exportedAt`（ISO-8601）。文件级 `timezone` 默认 `Asia/Shanghai`。每 15 分钟同步时，`staleAfterMinutes` 用 45。完整字段见 [`schema/routines.schema.json`](schema/routines.schema.json)。

定时触发器：

```json
{ "type": "cron", "expression": "15 8 * * 1-5" }
```

五段标准 cron：分、时、日、月、周。webhook 没有固定时刻：

```json
{ "type": "webhook", "path": "/hooks/example", "description": "示例表单调用。" }
```

Grok Bot 的导出脚本是 [`scripts/export-routines.mjs`](scripts/export-routines.mjs)。它读取 `AGENTS_ROOT`（机器人电脑上是 `/home/box/agent-data/agents`）下面每个机器人的 `profile.json` 名字，以及 `automations/*/automation.json`。发布脚本是 [`scripts/export-and-upload.sh`](scripts/export-and-upload.sh)。`SYNC_TARGET=r2`（默认）时用 `wrangler r2 object put --remote`，或者在 `R2_CLI=cf` 时用 `cf` CLI。`file`、`http`、`blob`、`kv`、`netlify` 走 [`scripts/publish-routines.mjs`](scripts/publish-routines.mjs)，在服务端写入对应的私有存储。成功时不打印。

在机器人电脑上用 `nohup` 做后台循环，关掉应用后进程会暂停，数据就停了。能持续同步的做法是上面的服务器端例程：每 15 分钟叫醒机器人，跑导出和上传，成功则不发消息。

不是 Grok Bot 的数据源，可以改 [`scripts/export-routines.example.mjs`](scripts/export-routines.example.mjs)，或参考 [`docs/examples/github-actions-sync.yml`](docs/examples/github-actions-sync.yml) 和 [`docs/examples/cloudflare-cron.mjs`](docs/examples/cloudflare-cron.mjs)。那两个例子默认不要启用。GitHub 托管的 runner 读不到机器人电脑上的目录。

静态演示也可以在「数据设置」里填一个 JSON 网址，或用 `/?data=` 传入。远程地址必须允许浏览器跨域读取。第一次加载失败时会退回内置示例。

页面大约每 45 秒重新拉取。轮询期间新出现的任务会标上「新」。

### 部署

- **静态演示 / GitHub Pages**：只发布虚构示例，不接私有存储。仓库已带 [`.github/workflows/pages.yml`](.github/workflows/pages.yml)。在 Settings → Pages 里把 Source 设为 GitHub Actions，推送到 `main`。本仓库的演示地址是 `https://dingyi.github.io/bot-routines-tracker/`。工作流里的 `PAGES_BASE_PATH` 是 `/bot-routines-tracker`。fork 之后如果仓库名变了，把这个路径改成新的仓库名。其他静态空间：`npm run build` 后上传 `out/`。挂在域名根上时不要设置 `PAGES_BASE_PATH`。
- **私有数据**：Cloudflare Workers + R2 是推荐路径，不是唯一路径。Vercel、Netlify 和你自己的服务器运行 [`server/index.mjs`](server/index.mjs)，由它托管 `out/`，并按 `FEED_SOURCE` 读取私有文件、私有网址、Vercel Blob、KV 或 Netlify Blobs。Cloudflare Worker 默认从绑定 `ROUTINES_BUCKET` 读取；设置了 `ROUTINES_URL` 和 `ROUTINES_TOKEN` 时改为在服务端用令牌拉取私有网址，不再读 R2。`/api/*` 和 `/routines.json` 都先进入这段服务端逻辑，所以访客拿到的不是包进 `out/` 的虚构示例。构建时 `PAGES_BASE_PATH` 留空。存储不要公开。`SITE_PASSWORD` 用平台的密钥或服务器环境变量设置，不要写进会提交的配置。`GET /api/auth` 在 Cloudflare 上是 `"mode":"worker"`，在 Node 服务器上是 `"mode":"server"`。页面把这两种都当成服务器口令。

### 口令

静态演示如果在构建时设置了 `NEXT_PUBLIC_GATE_PASSWORD`，打开页面要先输入这串口令。它会写进静态 JS，只适合挡一挡虚构示例。

私有站点的 `SITE_PASSWORD` 留在托管它的服务器上。浏览器对上之后只拿到一个 HttpOnly cookie，对不上就看不到 JSON。忘了口令就重新设置密钥，不用改页面。

## License

[MIT](LICENSE)
