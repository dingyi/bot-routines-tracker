import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { readFeed, selectFeedSource } from "./feed.mjs";
import { FeedError, feedError, publicMessage } from "./remote-feed.mjs";
import { passwordMatches, sessionToken, tokensMatch } from "./session.mjs";

const COOKIE = "br_session";
const MAX_BODY = 2048;
const SESSION_MAX_AGE = 60 * 60 * 24 * 14;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
  [".woff2", "font/woff2"],
]);

/**
 * @param {string} host
 */
export function isLoopback(host) {
  const value = host.trim().toLowerCase();
  return value === "127.0.0.1" || value === "localhost" || value === "::1";
}

/**
 * @param {Record<string, string | undefined>} env
 */
function passwordReady(env) {
  return (env.SITE_PASSWORD ?? "").trim().length > 0;
}

/**
 * @param {{ host: string, env: Record<string, string | undefined> }} options
 */
export function assertStartup(options) {
  if (!isLoopback(options.host) && !passwordReady(options.env)) throw feedError("publicBind");
  const source = selectFeedSource(options.env);
  if (source && !passwordReady(options.env)) throw feedError("passwordRequired");
  return source;
}

/**
 * @param {string} header
 * @param {string} name
 */
function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

/**
 * @param {string} token
 * @param {number} maxAge
 * @param {boolean} secure
 */
export function sessionCookie(token, maxAge, secure) {
  const suffix = secure ? "; Secure" : "";
  return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${suffix}`;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {string} host
 */
function wantsSecure(req, host) {
  const forwarded = String(req.headers["x-forwarded-proto"] ?? "")
    .split(",")[0]
    ?.trim();
  if (forwarded === "https") return true;
  return !isLoopback(host);
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 * @param {Record<string, string>} [extra]
 */
function sendJson(res, status, body, extra) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
    ...extra,
  });
  res.end(payload);
}

/**
 * @param {import("node:http").IncomingMessage} req
 */
function readSmallBody(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      const buffer = /** @type {Buffer} */ (chunk);
      size += buffer.length;
      if (size > MAX_BODY) {
        reject(feedError("bodyLarge"));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => reject(feedError("badRequest")));
  });
}

/**
 * @param {string} outDir
 * @param {string} urlPath
 */
function resolveStatic(outDir, urlPath) {
  /** @type {string} */
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const candidate = path.resolve(outDir, decoded.replace(/^\/+/, ""));
  if (candidate !== outDir && !candidate.startsWith(outDir + path.sep)) return null;
  return candidate;
}

/**
 * @param {string} file
 */
function contentType(file) {
  return CONTENT_TYPES.get(path.extname(file).toLowerCase()) ?? "application/octet-stream";
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {string} outDir
 * @param {string} urlPath
 */
async function sendStatic(res, outDir, urlPath) {
  const candidate = resolveStatic(outDir, urlPath);
  if (!candidate) {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  /** @type {string | null} */
  let file = candidate;
  /** @type {import("node:fs").Stats | null} */
  let info = null;
  try {
    info = await stat(file);
  } catch {
    info = null;
  }
  if (info?.isDirectory()) {
    file = path.join(file, "index.html");
    try {
      info = await stat(file);
    } catch {
      info = null;
    }
  } else if (!info) {
    const html = `${candidate}.html`;
    try {
      const htmlInfo = await stat(html);
      if (htmlInfo.isFile()) {
        file = html;
        info = htmlInfo;
      }
    } catch {
      info = null;
    }
  }
  if (!info?.isFile() || !file) {
    try {
      const body = await readFile(path.join(outDir, "404.html"));
      res.writeHead(404, { "content-type": "text/html; charset=utf-8", "content-length": body.length });
      res.end(body);
    } catch {
      sendJson(res, 404, { error: "not found" });
    }
    return;
  }
  const body = await readFile(file);
  res.writeHead(200, { "content-type": contentType(file), "content-length": body.length });
  res.end(body);
}

/**
 * Visitor-facing status for a private feed. Details stay in the server log.
 * @param {FeedError} error
 */
function visitorFeed(error) {
  if (error.status === 404) return { status: 404, error: "routines.json is not available yet" };
  if (error.status === 413) return { status: 413, error: "routines object is too large" };
  if (error.status === 503) return { status: 503, error: "the private feed is not configured" };
  return { status: 502, error: "routines feed failed" };
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{ root?: string, env: Record<string, string | undefined>, host: string, deps?: { fetch?: typeof fetch, store?: { get: Function, set: Function } } }} options
 */
export async function handleNodeRequest(req, res, options) {
  const env = options.env;
  const host = options.host;
  const root = options.root ?? ROOT;
  const outDir = path.join(root, "out");
  const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
  const pathname = requestUrl.pathname.length > 1 ? requestUrl.pathname.replace(/\/+$/, "") : requestUrl.pathname;
  const source = selectFeedSource(env);
  const configured = passwordReady(env);
  const cookie = readCookie(req.headers.cookie ?? "", COOKIE);
  const expected = configured ? sessionToken(env.SITE_PASSWORD ?? "") : "";
  const unlocked = configured && cookie !== null && tokensMatch(cookie, expected);

  if (pathname === "/api/auth" || pathname === "/api/session" || pathname === "/api/logout" || (pathname === "/routines.json" && source)) {
    if (!source && pathname !== "/routines.json") {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    if (pathname === "/api/auth" && req.method === "GET") {
      sendJson(res, 200, { mode: "server", required: true, configured, unlocked });
      return;
    }
    if (pathname === "/api/logout" && req.method === "POST") {
      res.writeHead(204, {
        "cache-control": "no-store",
        "set-cookie": sessionCookie("", 0, wantsSecure(req, host)),
      });
      res.end();
      return;
    }
    if (pathname === "/api/session" && req.method === "POST") {
      if (!configured) {
        sendJson(res, 503, { error: "SITE_PASSWORD is not configured" });
        return;
      }
      /** @type {string} */
      let text;
      try {
        text = await readSmallBody(req);
      } catch (error) {
        if (error instanceof FeedError && error.message === "body too large") {
          sendJson(res, 400, { error: "bad request" });
          return;
        }
        sendJson(res, 400, { error: "bad request" });
        return;
      }
      /** @type {unknown} */
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        sendJson(res, 400, { error: "bad request" });
        return;
      }
      const password =
        typeof payload === "object" && payload !== null && "password" in payload && typeof payload.password === "string"
          ? payload.password
          : "";
      if (password.length === 0 || password.length > 512 || !passwordMatches(password, env.SITE_PASSWORD ?? "")) {
        sendJson(res, 401, { error: "unauthorized" });
        return;
      }
      const token = sessionToken(env.SITE_PASSWORD ?? "");
      res.writeHead(204, {
        "cache-control": "no-store",
        "set-cookie": sessionCookie(token, SESSION_MAX_AGE, wantsSecure(req, host)),
      });
      res.end();
      return;
    }
    if (pathname === "/routines.json" && req.method === "GET") {
      if (!configured) {
        sendJson(res, 503, { error: "SITE_PASSWORD is not configured" });
        return;
      }
      if (!unlocked) {
        sendJson(res, 401, { error: "unauthorized" });
        return;
      }
      try {
        const feed = await readFeed(env, { ...options.deps, cwd: root });
        if (!feed.body) {
          sendJson(res, 404, { error: "routines.json is not available yet" });
          return;
        }
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "content-length": Buffer.byteLength(feed.body),
        });
        res.end(feed.body);
      } catch (error) {
        console.error(JSON.stringify({ message: "private feed failed", error: publicMessage(error) }));
        if (error instanceof FeedError) {
          const visitor = visitorFeed(error);
          sendJson(res, visitor.status, { error: visitor.error });
          return;
        }
        sendJson(res, 502, { error: "routines feed failed" });
      }
      return;
    }
    sendJson(res, 405, { error: "method not allowed" });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "method not allowed" });
    return;
  }
  await sendStatic(res, outDir, pathname);
}

/**
 * @param {{ host?: string, port?: number, root?: string, env?: Record<string, string | undefined>, deps?: { fetch?: typeof fetch, store?: { get: Function, set: Function } } }} [options]
 */
export function startServer(options = {}) {
  const host = options.host ?? (process.env.HOST?.trim() || "127.0.0.1");
  const port = options.port ?? Number(process.env.PORT ?? "8788");
  const env = options.env ?? process.env;
  assertStartup({ host, env });
  const server = createServer((req, res) => {
    handleNodeRequest(req, res, { root: options.root, env, host, deps: options.deps }).catch((error) => {
      console.error(JSON.stringify({ message: "server request failed", error: publicMessage(error) }));
      if (!res.headersSent) sendJson(res, 500, { error: "request failed" });
      else res.end();
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const host = process.env.HOST?.trim() || "127.0.0.1";
  const port = Number(process.env.PORT ?? "8788");
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    process.stderr.write("PORT is not valid\n");
    process.exit(1);
  }
  startServer({ host, port }).catch((error) => {
    process.stderr.write(`${publicMessage(error)}\n`);
    process.exit(1);
  });
}
