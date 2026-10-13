import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { assertStartup, sessionCookie, startServer } from "./index.mjs";

const PASSWORD = "correct horse battery";

/**
 * @param {import("node:http").Server} server
 */
function origin(server) {
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("missing port");
  return `http://127.0.0.1:${address.port}`;
}

/**
 * @param {number} port
 * @param {string} urlPath
 */
function rawGet(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port, path: urlPath, method: "GET" }, (res) => {
      /** @type {Buffer[]} */
      const chunks = [];
      res.on("data", (chunk) => chunks.push(/** @type {Buffer} */ (chunk)));
      res.on("end", () => {
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

test("startup refuses a public bind or a private feed without a password", () => {
  assert.throws(() => assertStartup({ host: "0.0.0.0", env: {} }), /SITE_PASSWORD/);
  assert.throws(
    () => assertStartup({ host: "127.0.0.1", env: { FEED_SOURCE: "file", ROUTINES_FILE: "/tmp/routines.json" } }),
    /SITE_PASSWORD/,
  );
  assert.equal(assertStartup({ host: "127.0.0.1", env: {} }), null);
});

test("session cookies are Secure on public hosts", () => {
  assert.match(sessionCookie("abc", 10, true), /Secure/);
  assert.equal(sessionCookie("abc", 10, false).includes("Secure"), false);
  assert.match(sessionCookie("abc", 10, false), /HttpOnly/);
});

test("the node server gates a private file and still serves the static demo", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "routines-server-"));
  mkdirSync(path.join(root, "out"));
  const sample = '{"version":1,"routines":[{"id":"sample"}]}';
  const synced = '{"version":1,"routines":[{"id":"private"}]}';
  writeFileSync(path.join(root, "out", "index.html"), "<p>demo</p>");
  writeFileSync(path.join(root, "out", "routines.json"), sample);
  writeFileSync(path.join(root, "secret.txt"), "do-not-serve");
  const store = path.join(root, "store", "routines.json");
  mkdirSync(path.dirname(store));
  writeFileSync(store, synced);

  const server = await startServer({
    host: "127.0.0.1",
    port: 0,
    root,
    env: {
      SITE_PASSWORD: PASSWORD,
      FEED_SOURCE: "file",
      ROUTINES_FILE: store,
    },
  });
  try {
    const base = origin(server);
    const auth = await fetch(`${base}/api/auth`);
    assert.equal(auth.status, 200);
    const payload = await auth.json();
    assert.equal(payload.mode, "server");
    assert.equal(payload.unlocked, false);

    const closed = await fetch(`${base}/routines.json`);
    assert.equal(closed.status, 401);

    const denied = await fetch(`${base}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "nope" }),
    });
    assert.equal(denied.status, 401);

    const granted = await fetch(`${base}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: PASSWORD }),
    });
    assert.equal(granted.status, 204);
    const setCookie = granted.headers.getSetCookie()[0] ?? granted.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /HttpOnly/);
    assert.equal(setCookie.includes(PASSWORD), false);
    const token = /br_session=([^;]+)/.exec(setCookie)?.[1];
    assert.ok(token);

    const open = await fetch(`${base}/routines.json`, { headers: { cookie: `br_session=${token}` } });
    assert.equal(open.status, 200);
    assert.equal(open.headers.get("cache-control"), "no-store");
    assert.equal(await open.text(), synced);

    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.equal(await page.text(), "<p>demo</p>");

    const address = server.address();
    if (typeof address !== "object" || address === null) throw new Error("missing port");
    const escaped = await rawGet(address.port, "/../secret.txt");
    assert.equal(escaped.status, 404);
    assert.equal(escaped.body.includes("do-not-serve"), false);
  } finally {
    await new Promise((resolve) => server.close(() => resolve(undefined)));
    rmSync(root, { recursive: true, force: true });
  }
});

test("without a private feed the server serves the sample and hides auth", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "routines-static-"));
  mkdirSync(path.join(root, "out"));
  writeFileSync(path.join(root, "out", "routines.json"), '{"version":1,"routines":[{"id":"sample"}]}');
  const server = await startServer({ host: "127.0.0.1", port: 0, root, env: {} });
  try {
    const base = origin(server);
    const auth = await fetch(`${base}/api/auth`);
    assert.equal(auth.status, 404);
    const sample = await fetch(`${base}/routines.json`);
    assert.equal(sample.status, 200);
    assert.equal(await sample.text(), '{"version":1,"routines":[{"id":"sample"}]}');
  } finally {
    await new Promise((resolve) => server.close(() => resolve(undefined)));
    rmSync(root, { recursive: true, force: true });
  }
});

test("a private URL is fetched by the server with the token", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "routines-url-"));
  mkdirSync(path.join(root, "out"));
  writeFileSync(path.join(root, "out", "index.html"), "ok");
  /** @type {string[]} */
  const seen = [];
  const server = await startServer({
    host: "127.0.0.1",
    port: 0,
    root,
    env: {
      SITE_PASSWORD: PASSWORD,
      FEED_SOURCE: "url",
      ROUTINES_URL: "https://feed.example/routines.json",
      ROUTINES_TOKEN: "url-token",
    },
    deps: {
      fetch: async (input, init) => {
        seen.push(String(input));
        assert.equal(new Headers(init?.headers).get("authorization"), "Bearer url-token");
        assert.equal(init?.redirect, "manual");
        return new Response('{"version":1,"routines":[{"id":"remote"}]}', { status: 200 });
      },
    },
  });
  try {
    const base = origin(server);
    const granted = await fetch(`${base}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: PASSWORD }),
    });
    const token = /br_session=([^;]+)/.exec(granted.headers.getSetCookie()[0] ?? "")?.[1];
    const open = await fetch(`${base}/routines.json`, { headers: { cookie: `br_session=${token}` } });
    assert.equal(await open.text(), '{"version":1,"routines":[{"id":"remote"}]}');
    assert.equal(seen[0], "https://feed.example/routines.json");
  } finally {
    await new Promise((resolve) => server.close(() => resolve(undefined)));
    rmSync(root, { recursive: true, force: true });
  }
});
