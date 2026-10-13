import { Cron } from "croner";
import cronstrue from "cronstrue/i18n";
import { DAY_COUNT, RUNS_PER_DAY } from "./preferences";
import { addDaysToKey, zonedDayKey, zonedMidnight } from "./time";
import type { Routine, RoutinesFile } from "./types";

const CRON_OPTIONS = { paused: true, unref: true, legacyMode: true } as const;

export function explainCron(expression: string, locale: "zh" | "en"): string {
  try {
    return cronstrue.toString(expression, {
      locale: locale === "zh" ? "zh_CN" : "en",
      use24HourTimeFormat: true,
      throwExceptionOnParseError: true,
    });
  } catch {
    return "";
  }
}

export function routineZone(routine: Routine, fileZone: string): string {
  if (routine.trigger.type === "cron" && routine.trigger.timezone) {
    return routine.trigger.timezone;
  }
  return fileZone;
}

function openCron(expression: string, timezone: string): Cron {
  return new Cron(expression, { ...CRON_OPTIONS, timezone });
}

export function nextOccurrence(expression: string, timezone: string, from: Date): Date | null {
  const cron = openCron(expression, timezone);
  try {
    return cron.nextRun(from);
  } finally {
    cron.stop();
  }
}

export function runsBetween(expression: string, timezone: string, start: Date, end: Date): Date[] {
  const cron = openCron(expression, timezone);
  try {
    const runs: Date[] = [];
    const seen = new Set<number>();
    let cursor = new Date(start.getTime() - 1000);
    while (runs.length < 2500) {
      const batch = cron.nextRuns(120, cursor);
      if (batch.length === 0) break;
      let advanced = false;
      for (const run of batch) {
        const time = run.getTime();
        if (time >= end.getTime()) return runs;
        if (time >= start.getTime() && !seen.has(time)) {
          seen.add(time);
          runs.push(run);
        }
        if (time > cursor.getTime()) {
          cursor = run;
          advanced = true;
        }
      }
      if (!advanced) break;
    }
    return runs;
  } finally {
    cron.stop();
  }
}

export type ScheduledRun = {
  routineId: string;
  at: Date;
};

export type DayColumn = {
  key: string;
  start: Date;
  runs: ScheduledRun[];
  hidden: number;
};

export type BoardModel = {
  days: DayColumn[];
  nextById: Map<string, Date | null>;
  hero: { routineId: string; at: Date } | null;
  upcoming24h: number;
};

function pickAroundNow(runs: ScheduledRun[], now: number, limit: number): { shown: ScheduledRun[]; hidden: number } {
  if (runs.length <= limit) return { shown: runs, hidden: 0 };
  const sorted = [...runs].sort((a, b) => a.at.getTime() - b.at.getTime());
  const firstFuture = sorted.findIndex((run) => run.at.getTime() >= now);
  const anchor = firstFuture === -1 ? sorted.length : firstFuture;
  const start = Math.max(0, Math.min(anchor > 0 ? anchor - 1 : 0, sorted.length - limit));
  return { shown: sorted.slice(start, start + limit), hidden: sorted.length - limit };
}

export function buildBoard(file: RoutinesFile, displayZone: string, now: Date): BoardModel {
  const todayKey = zonedDayKey(now, displayZone);
  const windowStart = zonedMidnight(todayKey, displayZone);
  const windowEnd = zonedMidnight(addDaysToKey(todayKey, DAY_COUNT), displayZone);
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const nextById = new Map<string, Date | null>();
  const byDay = new Map<string, ScheduledRun[]>();
  for (let offset = 0; offset < DAY_COUNT; offset += 1) {
    byDay.set(addDaysToKey(todayKey, offset), []);
  }

  let hero: { routineId: string; at: Date } | null = null;
  let upcoming24h = 0;

  for (const routine of file.routines) {
    if (routine.trigger.type !== "cron") {
      nextById.set(routine.id, null);
      continue;
    }
    const zone = routineZone(routine, file.timezone);
    let next: Date | null = null;
    try {
      next = nextOccurrence(routine.trigger.expression, zone, now);
    } catch {
      next = null;
    }
    nextById.set(routine.id, next);
    if (routine.status === "enabled" && next) {
      if (!hero || next.getTime() < hero.at.getTime()) {
        hero = { routineId: routine.id, at: next };
      }
    }
    let runs: Date[] = [];
    try {
      runs = runsBetween(routine.trigger.expression, zone, windowStart, windowEnd);
    } catch {
      runs = [];
    }
    for (const at of runs) {
      if (routine.status === "enabled" && at.getTime() >= now.getTime() && at.getTime() < horizon.getTime()) {
        upcoming24h += 1;
      }
      const key = zonedDayKey(at, displayZone);
      const bucket = byDay.get(key);
      if (bucket) bucket.push({ routineId: routine.id, at });
    }
  }

  const days: DayColumn[] = [];
  for (let offset = 0; offset < DAY_COUNT; offset += 1) {
    const key = addDaysToKey(todayKey, offset);
    const runs = byDay.get(key) ?? [];
    runs.sort((a, b) => a.at.getTime() - b.at.getTime());
    const picked = pickAroundNow(runs, now.getTime(), RUNS_PER_DAY);
    days.push({
      key,
      start: zonedMidnight(key, displayZone),
      runs: picked.shown,
      hidden: picked.hidden,
    });
  }

  return { days, nextById, hero, upcoming24h };
}
