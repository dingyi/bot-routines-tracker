import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseRoutines } from "./parse";
import { buildBoard, explainCron, nextOccurrence } from "./schedule";
import { zonedDayKey, zonedMidnight } from "./time";

test("Shanghai midnight is the previous UTC evening", () => {
  const midnight = zonedMidnight("2026-10-13", "Asia/Shanghai");
  assert.equal(midnight.toISOString(), "2026-10-12T16:00:00.000Z");
  assert.equal(zonedDayKey(midnight, "Asia/Shanghai"), "2026-10-13");
});

test("next weekday morning in Shanghai", () => {
  const from = new Date("2026-10-13T05:00:00.000Z");
  const next = nextOccurrence("15 8 * * 1-5", "Asia/Shanghai", from);
  assert.ok(next);
  assert.equal(next.toISOString(), "2026-10-14T00:15:00.000Z");
});

test("cron explanation is Chinese", () => {
  const text = explainCron("15 8 * * 1-5", "zh");
  assert.match(text, /[\u4e00-\u9fff]/);
});

test("sample file is fictional and within the expected size", () => {
  const raw: unknown = JSON.parse(readFileSync(path.join(process.cwd(), "public/routines.json"), "utf8"));
  const parsed = parseRoutines(raw);
  assert.equal(parsed.skipped.length, 0);
  const { routines } = parsed.file;
  assert.ok(routines.length >= 15 && routines.length <= 20);
  assert.ok(routines.some((routine) => routine.status === "paused"));
  assert.ok(routines.some((routine) => routine.status === "enabled"));
  assert.ok(routines.some((routine) => routine.trigger.type === "cron"));
  assert.ok(routines.some((routine) => routine.trigger.type === "webhook"));
  const blob = JSON.stringify(raw);
  assert.equal(blob.includes("dingyi"), false);
  assert.equal(blob.toLowerCase().includes("password"), false);
});

test("invalid rows are skipped and valid rows remain", () => {
  const parsed = parseRoutines({
    version: 1,
    exportedAt: "2026-10-13T00:00:00.000Z",
    timezone: "Asia/Shanghai",
    routines: [
      {
        id: "ok",
        name: "Ok",
        bot: "Harbor",
        status: "enabled",
        prompt: "Hello",
        trigger: { type: "cron", expression: "0 9 * * 1" },
      },
      {
        id: "bad",
        name: "Bad",
        bot: "Harbor",
        status: "enabled",
        prompt: "Hello",
        trigger: { type: "cron", expression: "not a cron" },
      },
    ],
  });
  assert.equal(parsed.file.routines.length, 1);
  assert.equal(parsed.skipped.length, 1);
});

test("seven day board includes a known Shanghai run", () => {
  const parsed = parseRoutines({
    version: 1,
    exportedAt: "2026-10-13T05:00:00.000Z",
    timezone: "Asia/Shanghai",
    staleAfterMinutes: 180,
    routines: [
      {
        id: "brief",
        name: "Brief",
        bot: "Harbor",
        status: "enabled",
        prompt: "Hello",
        trigger: { type: "cron", expression: "15 8 * * 1-5" },
      },
    ],
  });
  const now = new Date("2026-10-13T05:00:00.000Z");
  const board = buildBoard(parsed.file, "Asia/Shanghai", now);
  assert.equal(board.days.length, 7);
  assert.equal(board.hero?.routineId, "brief");
  assert.equal(board.hero?.at.toISOString(), "2026-10-14T00:15:00.000Z");
  const wednesday = board.days.find((day) => day.key === "2026-10-14");
  assert.ok(wednesday?.runs.some((run) => run.at.toISOString() === "2026-10-14T00:15:00.000Z"));
});
