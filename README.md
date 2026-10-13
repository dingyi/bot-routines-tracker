# Bot Routines Tracker

A dashboard template for scheduled bot routines. It shows overview stats, a 7-day timeline computed from cron expressions, live countdowns, and a detail drawer. Default language is Chinese. Switch to English from the header.

There are two ways to run it. They are not the same deployment.

| | Static demo | Private Worker |
| --- | --- | --- |
| What it shows | The fictional `public/routines.json` in this repo | Your bots' routines, read from a private R2 bucket |
| Host | GitHub Pages, or any static host | A Cloudflare Worker at your own hostname |
| Access | Optional browser passphrase, compiled into the JavaScript | `SITE_PASSWORD`, checked on the server. The bucket stays private |
| Updates | Only when you rebuild | A Grok Bot routine every 15 minutes runs the export and upload |

The static demo never receives your prompts. The Worker does not publish the bucket.

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

Copy the block below into your own Grok Bot. Replace the two placeholders first. The bot clones this repo onto its computer, deploys the Worker to your Cloudflare account, uploads the first export, and creates the 15-minute sync routine.

Security, before you paste:

- Do not turn on public access for the R2 bucket, and do not enable the r2.dev URL.
- Prompts inside `automation.json` can be private. The bot should not print them, commit them, or paste them back into chat.
- The bot generates `SITE_PASSWORD` and tells you once. That value does not belong in git, in `wrangler.jsonc`, or in the sync routine's instructions.

```text
You are setting up bot-routines-tracker on my Cloudflare account. Do this on your own computer. Do not open or merge a pull request. Do not make the R2 bucket public, and do not enable r2.dev.

Placeholders I filled in:
- Cloudflare account id: <CLOUDFLARE_ACCOUNT_ID>
- Site name (lowercase letters, numbers, hyphens): <SITE_NAME>
- Repository: https://github.com/dingyi/bot-routines-tracker

If either placeholder is empty or still has angle brackets, stop and ask me.

Security:
- automation.json prompts may contain private information. Do not print them, commit them, or quote them in chat.
- Generate SITE_PASSWORD yourself from a CSPRNG (at least 24 bytes, for example `openssl rand -base64 24`). Tell me that password once in the final report. Do not write it into the repo, wrangler.jsonc, or the sync routine's instructions.
- The bucket stays private.

Steps:
1. Clone the repository (for example into ~/bot-routines-tracker) and run `npm ci`.
2. Authenticate the Cloudflare CLI for account <CLOUDFLARE_ACCOUNT_ID> (`npx wrangler login`, or CLOUDFLARE_API_TOKEN plus CLOUDFLARE_ACCOUNT_ID). If this machine uses the `cf` CLI instead of wrangler, use that for the same account. Confirm the active account id matches before you create anything.
3. Create a private R2 bucket named <SITE_NAME>-routines. If it already exists, reuse it. Do not change its access to public.
4. In wrangler.jsonc set "name" to <SITE_NAME> and the ROUTINES_BUCKET bucket_name to <SITE_NAME>-routines. Leave the binding name ROUTINES_BUCKET unchanged.
5. Put the generated password in the Worker secret SITE_PASSWORD (`printf '%s' "$SITE_PASSWORD" | npx wrangler secret put SITE_PASSWORD`). The shell variable is enough. Do not echo it into a file in the repo.
6. Build for the domain root, with PAGES_BASE_PATH empty: `PAGES_BASE_PATH= npm run build`
7. Deploy: `npx wrangler deploy` (or `cf` deploy if that is the CLI you authenticated). This Worker is the site. It is not the GitHub Pages demo.
8. Export this computer's agent files and upload once:
   AGENTS_ROOT=/home/box/agent-data/agents R2_BUCKET=<SITE_NAME>-routines R2_OBJECT_KEY=routines.json bash scripts/export-and-upload.sh
   Add R2_CLI=cf when you are using the cf CLI. The command must exit 0 and print nothing on success.
9. Create a routine on this bot, cron `*/15 * * * *`, whose only job is to run that same command from the clone directory.
   - On success, stay silent. Send me no message.
   - Do not start nohup, a background loop, or any other always-on process. Those pause when I close the app. This routine is the scheduler.
   - On failure, append one line with the exit code to ~/bot-routines-sync-failures. Do not write routines JSON or prompts into that file. When the file reaches two lines, tell me the sync failed twice in a row and include the last exit code, then delete the file. A later success deletes the file and stays silent.
10. Verify GET /api/auth returns JSON with "mode":"worker", and GET /routines.json without a session cookie returns 401. Report the Worker URL and the SITE_PASSWORD. Do not report the contents of routines.json.
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

On the Worker, the header says the data is synced. The static demo says it is the sample.

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

[`scripts/export-and-upload.sh`](scripts/export-and-upload.sh) writes that file and uploads it. It prints nothing when the upload works.

```bash
AGENTS_ROOT=/home/box/agent-data/agents \
R2_BUCKET=your-private-bucket \
R2_OBJECT_KEY=routines.json \
bash scripts/export-and-upload.sh
```

| Variable | Required | Meaning |
| --- | --- | --- |
| `AGENTS_ROOT` | yes | Agent directory |
| `R2_BUCKET` | yes | Private bucket name |
| `R2_OBJECT_KEY` | no | Object key. Default `routines.json` |
| `R2_CLI` | no | `wrangler` (default) or `cf` |
| `ROUTINES_TIMEZONE` | no | File time zone. Default `Asia/Shanghai` |
| `STALE_AFTER_MINUTES` | no | Stale threshold. Default `45` |

Upload uses `wrangler r2 object put --remote`, or the same subcommand via the `cf` CLI when `R2_CLI=cf`. `--remote` is required so the object lands in the account bucket.

A `nohup` loop on the bot computer pauses when the app closes, so the sync stops. The install prompt schedules a server-side routine instead. That routine wakes the bot, runs the script, and stays quiet when the upload succeeds.

For a scheduler that is not Grok Bot, [`scripts/export-routines.example.mjs`](scripts/export-routines.example.mjs) maps your own job list into the same JSON. Two optional examples live in [`docs/examples/github-actions-sync.yml`](docs/examples/github-actions-sync.yml) and [`docs/examples/cloudflare-cron.mjs`](docs/examples/cloudflare-cron.mjs). Copy them only when the data source is reachable from that runner. Leave them off for a Grok Bot deployment. Neither example makes the bucket public.

To load a file hosted somewhere else in the static demo, open **数据设置 / Data settings** and paste the URL, or open `/?data=https://example.com/routines.json`. The host must send CORS headers that allow the browser to read the JSON. If that request fails on first load, the page falls back to the bundled sample and says so.

Do not commit private prompts. The sample in this repo is fiction: invented bot names, generic instructions, and no real accounts.

## Deploy

### Static demo: GitHub Pages

This path serves the fictional sample. It does not connect to R2.

This repository includes [`.github/workflows/pages.yml`](.github/workflows/pages.yml). On every push to `main` it runs the tests, builds with `PAGES_BASE_PATH=/bot-routines-tracker`, and deploys the `out/` folder with GitHub Actions.

One-time setup:

1. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. Push to `main`.

The demo is then at `https://dingyi.github.io/bot-routines-tracker/`.

If you fork the repo and the repository name is different, change `PAGES_BASE_PATH` in the workflow to `/your-repo-name`.

Any other static host works the same way. Build with `PAGES_BASE_PATH` empty for a root domain, or set to the subpath, and upload `out/`. `public/.nojekyll` is included so a host that runs Jekyll does not drop the `_next` folder.

### Private data: Cloudflare Worker and R2

This path is the one the install prompt deploys. The Worker serves the static `out/` files and reads `routines.json` from the `ROUTINES_BUCKET` binding. `run_worker_first` covers `/api/*` and `/routines.json`, so the fictional sample inside `out/` is not what visitors receive.

- Build with `PAGES_BASE_PATH` empty. The Worker is mounted at the domain root.
- Create the bucket with `wrangler r2 bucket create`. Leave public access off.
- Set the secret with `wrangler secret put SITE_PASSWORD`. It is listed under `secrets.required` in [`wrangler.jsonc`](wrangler.jsonc) and is not a var.
- `npx wrangler deploy` publishes the Worker and the assets together.

`GET /api/auth` tells the page to use the server passphrase. `POST /api/session` sets an HttpOnly cookie after a constant-time check. `GET /routines.json` returns the private object only with that cookie, and tells the browser not to cache it. Until the secret is set, the Worker refuses the object.

The page still works as a static demo where `/api/auth` does not exist. It then uses the optional front-end gate below, or no gate at all.

## Password

Static demo: `NEXT_PUBLIC_GATE_PASSWORD` is optional. When it is set at **build** time, the page asks for that passphrase and remembers it in `sessionStorage`. The value is compiled into the JavaScript bundle. See [`.env.example`](.env.example). Use it only as a speed bump on the fictional sample.

Worker: `SITE_PASSWORD` stays on Cloudflare. The browser never receives the expected value, only a cookie after a match. Losing the password means setting a new secret. It does not mean editing the site.

## 中文

这个模板有两种跑法，不要混在一起。

| | 静态演示 | 私有 Worker |
| --- | --- | --- |
| 看到的数据 | 仓库里虚构的 `public/routines.json` | 你自己机器人的例行任务，从私有 R2 读取 |
| 托管 | GitHub Pages，或任何静态空间 | 你的 Cloudflare Worker |
| 访问 | 可选的浏览器口令，会写进 JS | 服务器上的 `SITE_PASSWORD`。存储桶保持私有 |
| 更新 | 只有重新构建才会变 | Grok Bot 每 15 分钟跑一次导出并上传 |

静态演示不会收到你的提示词。Worker 不会把存储桶公开。

界面默认中文，页头可以改成英文。本地看演示：

```bash
npm install
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。`npm run build` 的静态文件在 `out/`。

### 一键安装提示词

把下面整段复制给你自己的 Grok Bot。先替换两个占位符。它会在自己的电脑上克隆仓库，部署到你的 Cloudflare，做第一次导出，并建好每 15 分钟的同步例程。

粘贴之前：

- 不要打开 R2 的公开访问，也不要打开 r2.dev。
- `automation.json` 里的提示词可能是私密的。机器人不应打印、提交或贴回对话。
- 口令由机器人生成，只在最后告诉你一次。不要写进 git、`wrangler.jsonc`，或同步例程的指令里。

```text
请在你自己的电脑上，把 bot-routines-tracker 部署到我的 Cloudflare 账号。不要开 pull request，也不要合并。不要把 R2 存储桶设为公开，不要打开 r2.dev。

我已经填好的占位符：
- Cloudflare 账号 ID：<CLOUDFLARE_ACCOUNT_ID>
- 站点名称（小写字母、数字、连字符）：<SITE_NAME>
- 仓库：https://github.com/dingyi/bot-routines-tracker

如果占位符是空的，或者还留着尖括号，先停下来问我。

安全：
- automation.json 里的提示词可能包含私人信息。不要打印、提交，也不要在对话里引用原文。
- SITE_PASSWORD 用密码学安全的随机数自己生成（至少 24 字节，例如 `openssl rand -base64 24`）。只在最后的报告里告诉我一次。不要写进仓库、wrangler.jsonc，或同步例程的指令。
- 存储桶保持私有。

步骤：
1. 克隆仓库（例如到 ~/bot-routines-tracker），执行 `npm ci`。
2. 让 Cloudflare CLI 登录账号 <CLOUDFLARE_ACCOUNT_ID>（`npx wrangler login`，或 CLOUDFLARE_API_TOKEN 加 CLOUDFLARE_ACCOUNT_ID）。如果这台机器用的是 `cf` CLI，就用它登录同一个账号。创建任何资源之前，先确认当前账号 ID 一致。
3. 创建一个私有 R2 存储桶，名字是 <SITE_NAME>-routines。已经存在就沿用。不要改成公开。
4. 在 wrangler.jsonc 里把 "name" 改成 <SITE_NAME>，把 ROUTINES_BUCKET 的 bucket_name 改成 <SITE_NAME>-routines。绑定名 ROUTINES_BUCKET 不要改。
5. 把生成的口令设为 Worker 密钥 SITE_PASSWORD（`printf '%s' "$SITE_PASSWORD" | npx wrangler secret put SITE_PASSWORD`）。留在 shell 变量里即可，不要写进仓库里的文件。
6. 按域名根构建，PAGES_BASE_PATH 留空：`PAGES_BASE_PATH= npm run build`
7. 部署：`npx wrangler deploy`（如果你认证的是 `cf`，就用对应的 deploy）。这个 Worker 才是站点，不是 GitHub Pages 上的演示。
8. 导出这台电脑上的机器人数据并上传一次：
   AGENTS_ROOT=/home/box/agent-data/agents R2_BUCKET=<SITE_NAME>-routines R2_OBJECT_KEY=routines.json bash scripts/export-and-upload.sh
   使用 `cf` CLI 时加上 `R2_CLI=cf`。命令必须退出码为 0，成功时不打印内容。
9. 在这个机器人上创建一个例程，cron 为 `*/15 * * * *`，唯一的工作是在克隆目录里再跑一遍上面的命令。
   - 成功就保持沉默，不要给我发消息。
   - 不要用 nohup、后台循环或其他常驻进程。我关掉应用后那些进程会暂停。这个例程才是调度器。
   - 失败时往 ~/bot-routines-sync-failures 追加一行退出码。不要把 routines JSON 或提示词写进这个文件。文件凑满两行时，告诉我连续失败了两次，并带上最后一次退出码，然后删掉文件。之后一旦成功，删掉文件并继续保持沉默。
10. 确认 GET /api/auth 返回的 JSON 里有 "mode":"worker"，不带会话 cookie 的 GET /routines.json 返回 401。向我报告 Worker 的网址和 SITE_PASSWORD。不要报告 routines.json 的内容。
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

Grok Bot 的导出脚本是 [`scripts/export-routines.mjs`](scripts/export-routines.mjs)。它读取 `AGENTS_ROOT`（机器人电脑上是 `/home/box/agent-data/agents`）下面每个机器人的 `profile.json` 名字，以及 `automations/*/automation.json`。上传脚本是 [`scripts/export-and-upload.sh`](scripts/export-and-upload.sh)，用 `wrangler r2 object put --remote`，或者在 `R2_CLI=cf` 时用 `cf` CLI。成功时不打印。

在机器人电脑上用 `nohup` 做后台循环，关掉应用后进程会暂停，数据就停了。能持续同步的做法是上面的服务器端例程：每 15 分钟叫醒机器人，跑导出和上传，成功则不发消息。

不是 Grok Bot 的数据源，可以改 [`scripts/export-routines.example.mjs`](scripts/export-routines.example.mjs)，或参考 [`docs/examples/github-actions-sync.yml`](docs/examples/github-actions-sync.yml) 和 [`docs/examples/cloudflare-cron.mjs`](docs/examples/cloudflare-cron.mjs)。那两个例子默认不要启用。GitHub 托管的 runner 读不到机器人电脑上的目录。

静态演示也可以在「数据设置」里填一个 JSON 网址，或用 `/?data=` 传入。远程地址必须允许浏览器跨域读取。第一次加载失败时会退回内置示例。

页面大约每 45 秒重新拉取。轮询期间新出现的任务会标上「新」。

### 部署

- **静态演示 / GitHub Pages**：只发布虚构示例，不接 R2。仓库已带 [`.github/workflows/pages.yml`](.github/workflows/pages.yml)。在 Settings → Pages 里把 Source 设为 GitHub Actions，推送到 `main`。本仓库的演示地址是 `https://dingyi.github.io/bot-routines-tracker/`。工作流里的 `PAGES_BASE_PATH` 是 `/bot-routines-tracker`。fork 之后如果仓库名变了，把这个路径改成新的仓库名。其他静态空间：`npm run build` 后上传 `out/`。挂在域名根上时不要设置 `PAGES_BASE_PATH`。
- **私有数据 / Cloudflare Worker**：这是安装提示词部署的那一套。Worker 托管 `out/`，并从绑定 `ROUTINES_BUCKET` 读取 `routines.json`。`/api/*` 和 `/routines.json` 先进入 Worker，所以访客拿到的不是包进 `out/` 的虚构示例。构建时 `PAGES_BASE_PATH` 留空。存储桶不要公开。`SITE_PASSWORD` 用 `wrangler secret put` 设置，不要写进配置文件。`npx wrangler deploy` 会同时发布脚本和静态资源。

### 口令

静态演示如果在构建时设置了 `NEXT_PUBLIC_GATE_PASSWORD`，打开页面要先输入这串口令。它会写进静态 JS，只适合挡一挡虚构示例。

Worker 的 `SITE_PASSWORD` 留在 Cloudflare 上。浏览器对上之后只拿到一个 HttpOnly cookie，对不上就看不到 JSON。忘了口令就重新设置密钥，不用改页面。

## License

[MIT](LICENSE)
