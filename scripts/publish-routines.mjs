#!/usr/bin/env node
/**
 * Publish an exported routines.json to the store selected by SYNC_TARGET.
 * Success prints nothing. Failures name the problem without the document or token.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { writeFeed } from "../server/feed.mjs";
import { publicMessage } from "../server/remote-feed.mjs";

/**
 * @param {string} file
 * @param {Record<string, string | undefined>} env
 * @param {{ fetch?: typeof fetch, cwd?: string, store?: { get: Function, set: Function } }} [deps]
 */
export async function publishRoutines(file, env, deps) {
  const body = readFileSync(file, "utf8");
  await writeFeed(env, body, deps);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write("Missing export file.\n");
    process.exit(1);
  }
  publishRoutines(file, process.env).catch((error) => {
    process.stderr.write(`${publicMessage(error)}\n`);
    process.exit(1);
  });
}
