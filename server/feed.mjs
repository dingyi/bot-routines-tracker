import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  FeedError,
  MAX_FEED_BYTES,
  assertObjectKey,
  feedError,
  readKv,
  readPrivateUrl,
  readVercelBlob,
  writeKv,
  writePrivateUrl,
  writeVercelBlob,
} from "./remote-feed.mjs";

const SOURCES = ["url", "file", "blob", "kv", "netlify"];

/**
 * @param {Record<string, string | undefined>} env
 */
export function configuredSources(env) {
  /** @type {string[]} */
  const found = [];
  if ((env.ROUTINES_URL ?? "").trim()) found.push("url");
  if ((env.ROUTINES_FILE ?? "").trim()) found.push("file");
  if ((env.BLOB_READ_WRITE_TOKEN ?? "").trim() || (env.BLOB_STORE_ID ?? "").trim()) found.push("blob");
  if ((env.KV_REST_API_URL ?? "").trim() || (env.KV_REST_API_TOKEN ?? "").trim()) found.push("kv");
  if (
    (env.NETLIFY_SITE_ID ?? "").trim() ||
    (env.NETLIFY_BLOBS_TOKEN ?? "").trim() ||
    (env.NETLIFY_AUTH_TOKEN ?? "").trim() ||
    (env.ROUTINES_NETLIFY_STORE ?? "").trim()
  ) {
    found.push("netlify");
  }
  return found;
}

/**
 * @param {Record<string, string | undefined>} env
 */
export function selectFeedSource(env) {
  const explicit = (env.FEED_SOURCE ?? "").trim();
  if (explicit) {
    if (!SOURCES.includes(explicit)) throw feedError("feedSource");
    return explicit;
  }
  const found = configuredSources(env);
  if (found.length > 1) throw feedError("feedAmbiguous");
  return found[0] ?? null;
}

/**
 * @param {Record<string, string | undefined>} env
 */
export function objectKey(env) {
  return assertObjectKey((env.ROUTINES_OBJECT_KEY ?? "routines.json").trim());
}

/**
 * @param {string} filePath
 * @param {string} [cwd]
 */
export function assertPrivateFile(filePath, cwd = process.cwd()) {
  if (typeof filePath !== "string" || filePath.trim() === "") throw feedError("fileMissingConfig");
  const resolved = path.resolve(filePath);
  const root = path.resolve(cwd);
  for (const dir of ["public", "out"]) {
    const blocked = path.join(root, dir);
    if (resolved === blocked || resolved.startsWith(blocked + path.sep)) throw feedError("filePublic");
  }
  return resolved;
}

/**
 * @param {string} filePath
 * @param {string} [cwd]
 */
export async function readFileFeed(filePath, cwd) {
  const resolved = assertPrivateFile(filePath, cwd);
  /** @type {import("node:fs").Stats} */
  let info;
  try {
    info = await stat(resolved);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
    throw feedError("fileRead");
  }
  if (!info.isFile()) throw feedError("fileRead");
  if (info.size > MAX_FEED_BYTES) throw feedError("tooLarge");
  return readFile(resolved, "utf8");
}

/**
 * @param {string} filePath
 * @param {string} body
 * @param {string} [cwd]
 */
export async function writeFileFeed(filePath, body, cwd) {
  const resolved = assertPrivateFile(filePath, cwd);
  if (typeof body !== "string" || Buffer.byteLength(body) > MAX_FEED_BYTES) throw feedError("tooLarge");
  const dir = path.dirname(resolved);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `.${path.basename(resolved)}.${process.pid}.tmp`);
  try {
    await writeFile(tmp, body, { mode: 0o600, flag: "w" });
    await chmod(tmp, 0o600);
    await rename(tmp, resolved);
    await chmod(resolved, 0o600);
  } catch (error) {
    await unlink(tmp).catch(() => {});
    if (error instanceof FeedError) throw error;
    throw feedError("fileWrite");
  }
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ store?: { get: (key: string, options: { type: string }) => Promise<string | null>, set: (key: string, value: string) => Promise<unknown> } }} [deps]
 */
async function netlifyStore(env, deps) {
  if (deps?.store) return deps.store;
  const token = (env.NETLIFY_BLOBS_TOKEN || env.NETLIFY_AUTH_TOKEN || "").trim();
  const siteID = (env.NETLIFY_SITE_ID || "").trim();
  if (!token || !siteID) throw feedError("netlifyConfig");
  const name = (env.ROUTINES_NETLIFY_STORE || "routines").trim();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62})$/.test(name)) throw feedError("netlifyName");
  /** @type {{ getStore?: Function }} */
  let mod;
  try {
    mod = await import("@netlify/blobs");
  } catch {
    throw feedError("netlifyPackage");
  }
  if (typeof mod.getStore !== "function") throw feedError("netlifyPackage");
  return mod.getStore({ name, siteID, token });
}

/**
 * @param {string} source
 * @param {Record<string, string | undefined>} env
 * @param {{ fetch?: typeof fetch, store?: { get: Function, set: Function }, cwd?: string }} [deps]
 * @returns {Promise<string | null>}
 */
async function readSource(source, env, deps = {}) {
  if (source === "url") return readPrivateUrl(env.ROUTINES_URL ?? "", env.ROUTINES_TOKEN ?? "", deps.fetch);
  if (source === "file") return readFileFeed(env.ROUTINES_FILE ?? "", deps.cwd);
  if (source === "blob") {
    return readVercelBlob({
      storeId: env.BLOB_STORE_ID ?? "",
      pathname: objectKey(env),
      token: env.BLOB_READ_WRITE_TOKEN ?? "",
      fetchImpl: deps.fetch,
    });
  }
  if (source === "kv") {
    return readKv({
      restUrl: env.KV_REST_API_URL ?? "",
      token: env.KV_REST_API_TOKEN ?? "",
      key: objectKey(env),
      fetchImpl: deps.fetch,
    });
  }
  const store = await netlifyStore(env, deps);
  const value = await store.get(objectKey(env), { type: "text" });
  if (value == null) return null;
  if (typeof value !== "string") throw feedError("failed");
  if (value.length > MAX_FEED_BYTES) throw feedError("tooLarge");
  return value;
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ fetch?: typeof fetch, store?: { get: Function, set: Function }, cwd?: string }} [deps]
 */
export async function readFeed(env, deps = {}) {
  const source = selectFeedSource(env);
  if (!source) return { configured: false, body: null };
  const body = await readSource(source, env, deps);
  return { configured: true, body };
}

/** @type {Record<string, string>} */
const WRITE_TARGETS = {
  file: "file",
  http: "url",
  blob: "blob",
  kv: "kv",
  netlify: "netlify",
};

/**
 * @param {string} source
 * @param {Record<string, string | undefined>} env
 * @param {string} body
 * @param {{ fetch?: typeof fetch, store?: { get: Function, set: Function }, cwd?: string }} [deps]
 */
async function writeSource(source, env, body, deps = {}) {
  if (source === "url") {
    await writePrivateUrl(env.ROUTINES_URL ?? "", env.ROUTINES_TOKEN ?? "", body, deps.fetch);
    return;
  }
  if (source === "file") {
    await writeFileFeed(env.ROUTINES_FILE ?? "", body, deps.cwd);
    return;
  }
  if (source === "blob") {
    await writeVercelBlob({
      storeId: env.BLOB_STORE_ID ?? "",
      pathname: objectKey(env),
      token: env.BLOB_READ_WRITE_TOKEN ?? "",
      body,
      fetchImpl: deps.fetch,
    });
    return;
  }
  if (source === "kv") {
    await writeKv({
      restUrl: env.KV_REST_API_URL ?? "",
      token: env.KV_REST_API_TOKEN ?? "",
      key: objectKey(env),
      body,
      fetchImpl: deps.fetch,
    });
    return;
  }
  const store = await netlifyStore(env, deps);
  await store.set(objectKey(env), body);
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} body
 * @param {{ fetch?: typeof fetch, store?: { get: Function, set: Function }, cwd?: string }} [deps]
 */
export async function writeFeed(env, body, deps = {}) {
  const target = (env.SYNC_TARGET ?? "").trim();
  const source = WRITE_TARGETS[target];
  if (!source) throw feedError("syncTarget");
  await writeSource(source, env, body, deps);
}
