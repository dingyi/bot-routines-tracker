import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "./index";
import { sessionToken } from "./session";

const PASSWORD = "correct horse battery";
const BODY = '{"version":1,"routines":[]}';

function env(options?: { password?: string; missing?: boolean }) {
  const stored = new Map<string, string>();
  if (!options?.missing) stored.set("routines.json", BODY);
  return {
    SITE_PASSWORD: options?.password ?? PASSWORD,
    ROUTINES_OBJECT_KEY: "routines.json",
    ROUTINES_BUCKET: {
      async get(key: string) {
        const text = stored.get(key);
        if (text === undefined) return null;
        return { size: text.length, text: async () => text };
      },
    },
    ASSETS: {
      async fetch() {
        return new Response("asset", { status: 200 });
      },
    },
  };
}

async function cookieFor(password: string): Promise<string> {
  const token = await sessionToken(password);
  return `br_session=${token}`;
}

test("auth reports a locked worker session", async () => {
  const response = await handleRequest(new Request("https://routines.example/api/auth"), env());
  assert.equal(response.status, 200);
  const body = (await response.json()) as { mode: string; unlocked: boolean; configured: boolean };
  assert.equal(body.mode, "worker");
  assert.equal(body.configured, true);
  assert.equal(body.unlocked, false);
});

test("session cookie unlocks routines.json and a wrong password does not", async () => {
  const denied = await handleRequest(
    new Request("https://routines.example/api/session", {
      method: "POST",
      body: JSON.stringify({ password: "nope" }),
    }),
    env(),
  );
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get("set-cookie"), null);

  const granted = await handleRequest(
    new Request("https://routines.example/api/session", {
      method: "POST",
      body: JSON.stringify({ password: PASSWORD }),
    }),
    env(),
  );
  assert.equal(granted.status, 204);
  const setCookie = granted.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.equal(setCookie.includes(PASSWORD), false);

  const closed = await handleRequest(new Request("https://routines.example/routines.json"), env());
  assert.equal(closed.status, 401);

  const open = await handleRequest(
    new Request("https://routines.example/routines.json", { headers: { cookie: await cookieFor(PASSWORD) } }),
    env(),
  );
  assert.equal(open.status, 200);
  assert.equal(open.headers.get("cache-control"), "no-store");
  assert.equal(await open.text(), BODY);
});

test("missing object and missing secret fail closed", async () => {
  const missing = await handleRequest(
    new Request("https://routines.example/routines.json", { headers: { cookie: await cookieFor(PASSWORD) } }),
    env({ missing: true }),
  );
  assert.equal(missing.status, 404);

  const unconfigured = await handleRequest(
    new Request("https://routines.example/routines.json"),
    env({ password: "   " }),
  );
  assert.equal(unconfigured.status, 503);
});

test("other paths are static assets", async () => {
  const response = await handleRequest(new Request("https://routines.example/"), env());
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "asset");
});
