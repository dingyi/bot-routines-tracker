import assert from "node:assert/strict";
import test from "node:test";
import { readKv, readPrivateUrl, readVercelBlob, writeKv, writePrivateUrl, writeVercelBlob } from "./remote-feed.mjs";

const TOKEN = "super-secret-token";
const DOCUMENT = '{"version":1,"routines":[]}';

/**
 * @param {(input: string, init: RequestInit) => Promise<Response>} handler
 */
function mockFetch(handler) {
  /** @type {{ input: string, init: RequestInit | undefined }[]} */
  const calls = [];
  /** @type {typeof fetch} */
  const fetchImpl = async (input, init) => {
    calls.push({ input: String(input), init });
    return handler(String(input), init ?? {});
  };
  return { calls, fetchImpl };
}

test("private URL sends the bearer token and refuses redirects", async () => {
  const ok = mockFetch(async () => new Response(DOCUMENT, { status: 200 }));
  assert.equal(await readPrivateUrl("https://feed.example/routines.json", TOKEN, ok.fetchImpl), DOCUMENT);
  assert.equal(ok.calls[0].init?.redirect, "manual");
  assert.equal(new Headers(ok.calls[0].init?.headers).get("authorization"), `Bearer ${TOKEN}`);

  const redirected = mockFetch(
    async () => new Response("nope", { status: 302, headers: { location: "https://evil.example/steal" } }),
  );
  await assert.rejects(readPrivateUrl("https://feed.example/routines.json", TOKEN, redirected.fetchImpl), (error) => {
    assert.equal(error.status, 502);
    assert.equal(String(error.message).includes(TOKEN), false);
    assert.equal(String(error.message).includes("evil.example"), false);
    assert.equal(String(error.message).includes("feed.example"), false);
    return true;
  });
  assert.equal(redirected.calls.length, 1);
});

test("private URL rejects insecure hosts, credentials, and leaked transport errors", async () => {
  const fetchImpl = async () => {
    throw new Error(`connect failed https://feed.example/routines.json ${TOKEN}`);
  };
  await assert.rejects(readPrivateUrl("http://feed.example/routines.json", TOKEN, fetchImpl), /https/);
  await assert.rejects(readPrivateUrl("https://user:secret@feed.example/routines.json", TOKEN, fetchImpl), /credentials/);
  await assert.rejects(readPrivateUrl("https://feed.example/routines.json", TOKEN, fetchImpl), (error) => {
    assert.equal(String(error.message).includes(TOKEN), false);
    assert.equal(String(error.message).includes("feed.example"), false);
    return true;
  });
  const local = mockFetch(async () => new Response(DOCUMENT, { status: 200 }));
  assert.equal(await readPrivateUrl("http://127.0.0.1:9/routines.json", TOKEN, local.fetchImpl), DOCUMENT);
});

test("private URL upload uses PUT and does not follow a redirect", async () => {
  const ok = mockFetch(async (_input, init) => {
    assert.equal(init.method, "PUT");
    assert.equal(init.body, DOCUMENT);
    assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${TOKEN}`);
    return new Response(null, { status: 204 });
  });
  await writePrivateUrl("https://feed.example/routines.json", TOKEN, DOCUMENT, ok.fetchImpl);
  assert.equal(ok.calls[0].init?.redirect, "manual");

  const redirected = mockFetch(
    async () => new Response(null, { status: 307, headers: { location: "https://evil.example/collect" } }),
  );
  await assert.rejects(writePrivateUrl("https://feed.example/routines.json", TOKEN, DOCUMENT, redirected.fetchImpl), (error) => {
    assert.equal(String(error.message).includes(TOKEN), false);
    assert.equal(String(error.message).includes("evil.example"), false);
    return true;
  });
  assert.equal(redirected.calls.length, 1);
});

test("vercel blob uses the private host and a private upload", async () => {
  const read = mockFetch(async () => new Response(DOCUMENT, { status: 200 }));
  await readVercelBlob({
    storeId: "store123",
    pathname: "routines.json",
    token: TOKEN,
    fetchImpl: read.fetchImpl,
  });
  assert.equal(read.calls[0].input, "https://store123.private.blob.vercel-storage.com/routines.json");
  assert.equal(read.calls[0].input.includes(".public.blob."), false);

  const write = mockFetch(async (_input, init) => {
    const headers = new Headers(init.headers);
    assert.equal(headers.get("x-vercel-blob-access"), "private");
    assert.equal(headers.get("x-api-version"), "12");
    assert.equal(headers.get("x-allow-overwrite"), "1");
    assert.equal(headers.get("authorization"), `Bearer ${TOKEN}`);
    assert.equal(init.body, DOCUMENT);
    return new Response(JSON.stringify({ url: "https://store123.private.blob.vercel-storage.com/routines.json" }), {
      status: 200,
    });
  });
  await writeVercelBlob({
    storeId: "store123",
    pathname: "routines.json",
    token: TOKEN,
    body: DOCUMENT,
    fetchImpl: write.fetchImpl,
  });
  assert.equal(write.calls[0].input.startsWith("https://vercel.com/api/blob/?pathname=routines.json"), true);

  const published = mockFetch(
    async () => new Response(JSON.stringify({ url: "https://store123.public.blob.vercel-storage.com/routines.json" }), { status: 200 }),
  );
  await assert.rejects(
    writeVercelBlob({
      storeId: "store123",
      pathname: "routines.json",
      token: TOKEN,
      body: DOCUMENT,
      fetchImpl: published.fetchImpl,
    }),
    /private/,
  );
});

test("kv keeps the document in the POST body", async () => {
  const fetchImpl = mockFetch(async (input, init) => {
    assert.equal(input.includes(DOCUMENT), false);
    assert.equal(input.includes("routines.json"), false);
    assert.deepEqual(JSON.parse(String(init.body)), ["SET", "routines.json", DOCUMENT]);
    return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
  });
  await writeKv({
    restUrl: "https://example.upstash.io",
    token: TOKEN,
    key: "routines.json",
    body: DOCUMENT,
    fetchImpl: fetchImpl.fetchImpl,
  });

  const read = mockFetch(async (_input, init) => {
    assert.deepEqual(JSON.parse(String(init.body)), ["GET", "routines.json"]);
    return new Response(JSON.stringify({ result: DOCUMENT }), { status: 200 });
  });
  assert.equal(
    await readKv({
      restUrl: "https://example.upstash.io",
      token: TOKEN,
      key: "routines.json",
      fetchImpl: read.fetchImpl,
    }),
    DOCUMENT,
  );

  const missing = mockFetch(async () => new Response(JSON.stringify({ result: null }), { status: 200 }));
  assert.equal(
    await readKv({
      restUrl: "https://example.upstash.io",
      token: TOKEN,
      key: "routines.json",
      fetchImpl: missing.fetchImpl,
    }),
    null,
  );
});
