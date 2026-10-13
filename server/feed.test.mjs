import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readFeed, selectFeedSource, writeFeed, writeFileFeed } from "./feed.mjs";

test("a private file is mode 0600 and cannot replace the sample site", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "routines-feed-"));
  try {
    await assert.rejects(writeFileFeed(path.join(cwd, "public", "routines.json"), "{}", cwd), /public site/);
    await assert.rejects(writeFileFeed(path.join(cwd, "out", "routines.json"), "{}", cwd), /public site/);

    const file = path.join(cwd, "store", "routines.json");
    await writeFileFeed(file, '{"version":1}\n', cwd);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(readFileSync(file, "utf8"), '{"version":1}\n');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("more than one configured store requires FEED_SOURCE", () => {
  assert.throws(
    () =>
      selectFeedSource({
        ROUTINES_URL: "https://feed.example/routines.json",
        ROUTINES_FILE: "/tmp/routines.json",
      }),
    /FEED_SOURCE/,
  );
  assert.equal(selectFeedSource({ FEED_SOURCE: "file", ROUTINES_URL: "https://feed.example/routines.json" }), "file");
});

test("netlify blobs stay behind the injected store", async () => {
  /** @type {Map<string, string>} */
  const saved = new Map();
  const store = {
    /**
     * @param {string} key
     * @param {string} value
     */
    async set(key, value) {
      saved.set(key, value);
    },
    /**
     * @param {string} key
     * @param {{ type: string }} options
     */
    async get(key, options) {
      assert.equal(options.type, "text");
      return saved.get(key) ?? null;
    },
  };
  const env = {
    SYNC_TARGET: "netlify",
    FEED_SOURCE: "netlify",
    NETLIFY_SITE_ID: "site",
    NETLIFY_BLOBS_TOKEN: "blob-token",
    ROUTINES_OBJECT_KEY: "routines.json",
  };
  await writeFeed(env, '{"version":1,"routines":[]}', { store });
  const read = await readFeed(env, { store });
  assert.equal(read.configured, true);
  assert.equal(read.body, '{"version":1,"routines":[]}');
  assert.equal(saved.has("routines.json"), true);
});
