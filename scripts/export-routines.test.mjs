import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { exportRoutines } from "./export-routines.mjs";

const fixtures = path.join(process.cwd(), "scripts/fixtures/agents");

test("maps agent profiles and automation files into routines.json", async () => {
  const result = await exportRoutines(fixtures, {
    timezone: "Asia/Shanghai",
    staleAfterMinutes: 45,
    now: new Date("2026-10-13T05:00:00.000Z"),
  });
  assert.deepEqual(
    result.skipped.map((line) => line.split(": ")[0]).sort(),
    ["pebble/bad-cron", "pebble/broken"],
  );
  const ids = result.file.routines.map((routine) => routine.id);
  assert.deepEqual(ids, [
    "harbor/morning",
    "lumen/inbox",
    "lumen/sweep",
    "pebble/watch",
    "sable/hourly",
  ]);
  assert.equal(result.file.version, 1);
  assert.equal(result.file.exportedAt, "2026-10-13T05:00:00.000Z");
  assert.equal(result.file.timezone, "Asia/Shanghai");
  assert.equal(result.file.staleAfterMinutes, 45);

  const morning = result.file.routines[0];
  assert.equal(morning.bot, "Harbor");
  assert.equal(morning.status, "enabled");
  assert.equal(morning.trigger.type, "cron");
  assert.equal(morning.trigger.expression, "15 8 * * 1-5");
  assert.equal(morning.trigger.timezone, "Asia/Shanghai");

  const sweep = result.file.routines.find((routine) => routine.id === "lumen/sweep");
  assert.equal(sweep.bot, "Lumen");
  assert.equal(sweep.status, "paused");
  assert.equal(sweep.trigger.expression, "0 9 * * 1");
  assert.equal(sweep.trigger.timezone, "Europe/London");
  assert.equal(sweep.prompt, "Stay quiet when nothing changed.");

  const watch = result.file.routines.find((routine) => routine.id === "pebble/watch");
  assert.equal(watch.trigger.type, "webhook");
  assert.equal(watch.trigger.path, "#example");
  assert.equal(watch.trigger.token, undefined);
  assert.equal(JSON.stringify(watch).includes("should-not-be-copied"), false);

  const hourly = result.file.routines.find((routine) => routine.id === "sable/hourly");
  assert.equal(hourly.bot, "sable");
  assert.equal(hourly.trigger.type, "cron");
  assert.equal(hourly.trigger.expression, "0 * * * *");

  const blob = JSON.stringify(result.file);
  assert.equal(blob.toLowerCase().includes("password"), false);
  assert.equal(blob.includes("dingyi"), false);
});

test("upload script stays quiet and calls the cf CLI with --remote", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "routines-upload-"));
  const log = path.join(dir, "args");
  const copy = path.join(dir, "uploaded.json");
  const fake = path.join(dir, "cf");
  writeFileSync(
    fake,
    `#!/bin/sh
printf '%s\\n' "$@" > "$FAKE_CF_LOG"
prev=""
for arg in "$@"; do
  if [ "$prev" = "--file" ]; then cp "$arg" "$FAKE_CF_COPY"; fi
  prev="$arg"
done
`,
  );
  chmodSync(fake, 0o755);
  const script = path.join(process.cwd(), "scripts/export-and-upload.sh");
  const ran = spawnSync("bash", [script], {
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH ?? ""}`,
      AGENTS_ROOT: fixtures,
      SYNC_TARGET: "r2",
      R2_BUCKET: "bot-routines-data",
      R2_OBJECT_KEY: "routines.json",
      R2_CLI: "cf",
      FAKE_CF_LOG: log,
      FAKE_CF_COPY: copy,
    },
    encoding: "utf8",
  });
  assert.equal(ran.status, 0, ran.stderr);
  assert.equal(ran.stdout, "");
  const args = readFileSync(log, "utf8").trim().split("\n");
  assert.deepEqual(args.slice(0, 4), ["r2", "object", "put", "bot-routines-data/routines.json"]);
  assert.ok(args.includes("--remote"));
  assert.ok(args.includes("--content-type"));
  const uploaded = JSON.parse(readFileSync(copy, "utf8"));
  assert.equal(uploaded.version, 1);
  assert.equal(uploaded.routines.length, 5);
  rmSync(dir, { recursive: true, force: true });
});

test("upload script fails when the bucket name is missing", () => {
  const ran = spawnSync("bash", [path.join(process.cwd(), "scripts/export-and-upload.sh")], {
    env: { ...process.env, AGENTS_ROOT: fixtures, SYNC_TARGET: "r2", R2_BUCKET: "" },
    encoding: "utf8",
  });
  assert.equal(ran.status, 1);
  assert.match(ran.stderr, /R2_BUCKET/);
  assert.equal(ran.stdout, "");
});

test("file target writes a private routines file and does not need R2", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "routines-file-"));
  const file = path.join(dir, "store", "routines.json");
  const ran = spawnSync("bash", [path.join(process.cwd(), "scripts/export-and-upload.sh")], {
    env: {
      ...process.env,
      AGENTS_ROOT: fixtures,
      SYNC_TARGET: "file",
      ROUTINES_FILE: file,
      R2_BUCKET: "",
    },
    encoding: "utf8",
  });
  try {
    assert.equal(ran.status, 0, ran.stderr);
    assert.equal(ran.stdout, "");
    const uploaded = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(uploaded.routines.length, 5);
    assert.equal(statSync(file).mode & 0o777, 0o600);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("http target does not print the token when the URL is rejected", () => {
  const ran = spawnSync("bash", [path.join(process.cwd(), "scripts/export-and-upload.sh")], {
    env: {
      ...process.env,
      AGENTS_ROOT: fixtures,
      SYNC_TARGET: "http",
      ROUTINES_URL: "http://feed.example/routines.json",
      ROUTINES_TOKEN: "super-secret-token",
      R2_BUCKET: "",
    },
    encoding: "utf8",
  });
  assert.equal(ran.status, 1);
  assert.match(ran.stderr, /https/);
  assert.equal(ran.stderr.includes("super-secret-token"), false);
  assert.equal(ran.stdout, "");
});
