/**
 * Fetch a private routines document. This module stays free of Node built-ins
 * so the Cloudflare Worker can import it. Tokens stay in headers, never in
 * the URL, and errors never include the URL, the token, or the body.
 */

export const MAX_FEED_BYTES = 8_000_000;

/** @type {Record<string, [string, number]>} */
export const FEED_ERRORS = {
  tokenMissing: ["routines token is not configured", 503],
  urlInvalid: ["routines URL is not valid", 400],
  urlCredentials: ["routines URL must not include credentials", 400],
  urlHttps: ["routines URL must use https", 400],
  redirected: ["routines feed redirected", 502],
  missing: ["routines feed missing", 404],
  tooLarge: ["routines object is too large", 413],
  failed: ["routines feed failed", 502],
  requestFailed: ["routines feed request failed", 502],
  keyInvalid: ["routines object key is not valid", 400],
  storeInvalid: ["blob store id is not valid", 400],
  storePublic: ["blob store must stay private", 502],
  fileMissingConfig: ["routines file is not configured", 503],
  filePublic: ["routines file must not live in the public site", 400],
  fileRead: ["routines file could not be read", 502],
  fileWrite: ["routines file could not be written", 502],
  netlifyConfig: ["Netlify blob credentials are not configured", 503],
  netlifyPackage: ["Install @netlify/blobs to use the Netlify store", 500],
  netlifyName: ["Netlify store name is not valid", 400],
  feedSource: ["FEED_SOURCE is not a known store", 400],
  feedAmbiguous: ["Set FEED_SOURCE when more than one store is configured", 400],
  syncTarget: ["SYNC_TARGET is not a known store", 400],
  publicBind: ["Set SITE_PASSWORD before listening on a public interface", 400],
  passwordRequired: ["Set SITE_PASSWORD before serving a private feed", 400],
  bodyLarge: ["body too large", 400],
  badRequest: ["bad request", 400],
};

const SAFE_MESSAGES = new Set(Object.values(FEED_ERRORS).map(([message]) => message));

export class FeedError extends Error {
  /**
   * @param {string} message
   * @param {number} [status]
   */
  constructor(message, status = 502) {
    super(message);
    this.name = "FeedError";
    this.status = status;
  }
}

/**
 * @param {keyof typeof FEED_ERRORS} key
 */
export function feedError(key) {
  const entry = FEED_ERRORS[key];
  return new FeedError(entry[0], entry[1]);
}

/**
 * @param {unknown} error
 */
export function publicMessage(error) {
  if (error instanceof FeedError && SAFE_MESSAGES.has(error.message)) return error.message;
  return "request failed";
}

/**
 * @param {string} raw
 */
export function assertFeedUrl(raw) {
  if (typeof raw !== "string" || raw.trim() === "") throw feedError("urlInvalid");
  /** @type {URL} */
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw feedError("urlInvalid");
  }
  if (url.username || url.password) throw feedError("urlCredentials");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (url.protocol === "https:") return url;
  if (url.protocol === "http:" && local) return url;
  throw feedError("urlHttps");
}

/**
 * @param {string} key
 */
export function assertObjectKey(key) {
  if (typeof key !== "string" || !/^[A-Za-z0-9._-]{1,200}$/.test(key)) throw feedError("keyInvalid");
  return key;
}

/**
 * @param {string} token
 */
function bearer(token) {
  if (typeof token !== "string" || token.trim() === "") throw feedError("tokenMissing");
  return token.trim();
}

/**
 * @param {Response} response
 */
async function discard(response) {
  try {
    await response.body?.cancel();
  } catch {
    // The caller is already failing the request.
  }
}

/**
 * @param {Response} response
 * @param {number} limit
 */
async function readLimited(response, limit) {
  if (response.status >= 300 && response.status < 400) {
    await discard(response);
    throw feedError("redirected");
  }
  const claimed = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(claimed) && claimed > limit) {
    await discard(response);
    throw feedError("tooLarge");
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (text.length > limit) throw feedError("tooLarge");
    return text;
  }
  /** @type {Uint8Array[]} */
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw feedError("tooLarge");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * @param {Response} response
 */
async function readDocument(response) {
  if (response.status === 404) {
    await discard(response);
    throw feedError("missing");
  }
  if (!response.ok) {
    await discard(response);
    throw feedError("failed");
  }
  return readLimited(response, MAX_FEED_BYTES);
}

/**
 * @param {string | URL} input
 * @param {RequestInit} init
 * @param {typeof fetch} fetchImpl
 */
async function request(input, init, fetchImpl) {
  try {
    return await fetchImpl(input, init);
  } catch {
    throw feedError("requestFailed");
  }
}

/**
 * @param {string} rawUrl
 * @param {string} token
 * @param {typeof fetch} [fetchImpl]
 */
export async function readPrivateUrl(rawUrl, token, fetchImpl = globalThis.fetch) {
  const url = assertFeedUrl(rawUrl);
  const secret = bearer(token);
  const response = await request(
    url,
    {
      method: "GET",
      redirect: "manual",
      headers: {
        authorization: `Bearer ${secret}`,
        accept: "application/json",
      },
    },
    fetchImpl,
  );
  return readDocument(response);
}

/**
 * @param {string} rawUrl
 * @param {string} token
 * @param {string} body
 * @param {typeof fetch} [fetchImpl]
 */
export async function writePrivateUrl(rawUrl, token, body, fetchImpl = globalThis.fetch) {
  if (typeof body !== "string" || body.length > MAX_FEED_BYTES) throw feedError("tooLarge");
  const url = assertFeedUrl(rawUrl);
  const secret = bearer(token);
  const response = await request(
    url,
    {
      method: "PUT",
      redirect: "manual",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body,
    },
    fetchImpl,
  );
  if (response.status >= 300 && response.status < 400) {
    await discard(response);
    throw feedError("redirected");
  }
  if (response.status !== 200 && response.status !== 201 && response.status !== 204) {
    await discard(response);
    throw feedError("failed");
  }
  await discard(response);
}

/**
 * @param {string} storeId
 */
function assertStoreId(storeId) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(storeId)) throw feedError("storeInvalid");
  return storeId;
}

/**
 * @param {{ storeId: string, pathname: string, token: string, fetchImpl?: typeof fetch }} options
 */
export async function readVercelBlob(options) {
  const storeId = assertStoreId(options.storeId.trim());
  const pathname = assertObjectKey(options.pathname.trim());
  const secret = bearer(options.token);
  const host = `${storeId}.private.blob.vercel-storage.com`;
  const response = await request(
    `https://${host}/${pathname}`,
    {
      method: "GET",
      redirect: "manual",
      headers: {
        authorization: `Bearer ${secret}`,
        accept: "application/json",
      },
    },
    options.fetchImpl ?? globalThis.fetch,
  );
  return readDocument(response);
}

/**
 * @param {{ storeId: string, pathname: string, token: string, body: string, fetchImpl?: typeof fetch }} options
 */
export async function writeVercelBlob(options) {
  const pathname = assertObjectKey(options.pathname.trim());
  assertStoreId(options.storeId.trim());
  if (typeof options.body !== "string" || options.body.length > MAX_FEED_BYTES) throw feedError("tooLarge");
  const secret = bearer(options.token);
  const response = await request(
    `https://vercel.com/api/blob/?pathname=${encodeURIComponent(pathname)}`,
    {
      method: "PUT",
      redirect: "manual",
      headers: {
        authorization: `Bearer ${secret}`,
        "x-api-version": "12",
        "x-vercel-blob-access": "private",
        "x-content-type": "application/json",
        "x-add-random-suffix": "0",
        "x-allow-overwrite": "1",
        "x-cache-control-max-age": "0",
      },
      body: options.body,
    },
    options.fetchImpl ?? globalThis.fetch,
  );
  if (response.status >= 300 && response.status < 400) {
    await discard(response);
    throw feedError("redirected");
  }
  if (!response.ok) {
    await discard(response);
    throw feedError("failed");
  }
  const ack = await readLimited(response, 65_536);
  if (!ack.trim()) return;
  /** @type {unknown} */
  let payload;
  try {
    payload = JSON.parse(ack);
  } catch {
    return;
  }
  if (typeof payload !== "object" || payload === null) return;
  const record = /** @type {Record<string, unknown>} */ (payload);
  for (const field of ["url", "downloadUrl"]) {
    const value = record[field];
    if (typeof value === "string" && value.includes(".public.blob.")) throw feedError("storePublic");
  }
}

/**
 * @param {string} restUrl
 * @param {string} token
 * @param {unknown[]} command
 * @param {typeof fetch} [fetchImpl]
 */
async function kvCommand(restUrl, token, command, fetchImpl = globalThis.fetch) {
  const url = assertFeedUrl(restUrl);
  const secret = bearer(token);
  const response = await request(
    url,
    {
      method: "POST",
      redirect: "manual",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(command),
    },
    fetchImpl,
  );
  if (response.status >= 300 && response.status < 400) {
    await discard(response);
    throw feedError("redirected");
  }
  if (!response.ok) {
    await discard(response);
    throw feedError("failed");
  }
  const text = await readLimited(response, MAX_FEED_BYTES * 2);
  /** @type {unknown} */
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw feedError("failed");
  }
  if (typeof payload !== "object" || payload === null || !("result" in payload)) throw feedError("failed");
  return /** @type {{ result: unknown }} */ (payload).result;
}

/**
 * @param {{ restUrl: string, token: string, key: string, fetchImpl?: typeof fetch }} options
 */
export async function readKv(options) {
  const key = assertObjectKey(options.key.trim());
  const result = await kvCommand(options.restUrl, options.token, ["GET", key], options.fetchImpl);
  if (result === null) return null;
  if (typeof result !== "string") throw feedError("failed");
  if (result.length > MAX_FEED_BYTES) throw feedError("tooLarge");
  return result;
}

/**
 * @param {{ restUrl: string, token: string, key: string, body: string, fetchImpl?: typeof fetch }} options
 */
export async function writeKv(options) {
  const key = assertObjectKey(options.key.trim());
  if (typeof options.body !== "string" || options.body.length > MAX_FEED_BYTES) throw feedError("tooLarge");
  await kvCommand(options.restUrl, options.token, ["SET", key, options.body], options.fetchImpl);
}
