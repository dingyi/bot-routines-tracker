import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkerAuth } from "./worker-auth";

test("accepts the worker and the node server auth payloads", () => {
  const worker = parseWorkerAuth({ mode: "worker", required: true, configured: true, unlocked: false });
  assert.equal(worker?.mode, "worker");
  assert.equal(worker?.unlocked, false);

  const server = parseWorkerAuth({ mode: "server", required: true, configured: true, unlocked: true });
  assert.equal(server?.mode, "server");
  assert.equal(server?.required, true);

  assert.equal(parseWorkerAuth({ mode: "static", required: true, unlocked: true }), null);
  assert.equal(parseWorkerAuth({ mode: "server", required: "yes", unlocked: true }), null);
  assert.equal(parseWorkerAuth(null), null);
});
