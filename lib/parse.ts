import { isValidTimeZone } from "./time";
import type { ParseResult, Routine, RoutineStatus, Trigger } from "./types";
import { Cron } from "croner";

const DEFAULT_STALE_MINUTES = 720;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function cronExpressionWorks(expression: string, timezone: string): boolean {
  try {
    const cron = new Cron(expression, { timezone, paused: true, unref: true, legacyMode: true });
    cron.stop();
    return true;
  } catch {
    return false;
  }
}

function readTrigger(value: unknown, fallbackZone: string): Trigger | string {
  if (!isRecord(value)) return "trigger must be an object";
  if (value.type === "webhook") {
    const path = asString(value.path);
    const description = asString(value.description);
    const trigger: Trigger = { type: "webhook" };
    if (path) trigger.path = path;
    if (description) trigger.description = description;
    return trigger;
  }
  if (value.type !== "cron") return "trigger type must be cron or webhook";
  const expression = asString(value.expression);
  if (!expression) return "cron expression is required";
  const timezone = asString(value.timezone) ?? undefined;
  if (timezone && !isValidTimeZone(timezone)) return `unknown timezone ${timezone}`;
  const zone = timezone ?? fallbackZone;
  if (!cronExpressionWorks(expression, zone)) return `invalid cron expression ${expression}`;
  const trigger: Trigger = { type: "cron", expression };
  if (timezone) trigger.timezone = timezone;
  return trigger;
}

export function parseRoutines(input: unknown): ParseResult {
  if (!isRecord(input)) {
    throw new Error("Root value must be a JSON object");
  }
  if ("version" in input && input.version !== 1) {
    throw new Error(`Unsupported routines file version: ${String(input.version)}`);
  }
  if (!Array.isArray(input.routines)) {
    throw new Error("routines must be an array");
  }

  const timezone = asString(input.timezone) ?? "Asia/Shanghai";
  if (!isValidTimeZone(timezone)) {
    throw new Error(`Unknown file timezone: ${timezone}`);
  }

  let staleAfterMinutes = DEFAULT_STALE_MINUTES;
  if (input.staleAfterMinutes !== undefined) {
    if (typeof input.staleAfterMinutes !== "number" || !Number.isFinite(input.staleAfterMinutes) || input.staleAfterMinutes < 1) {
      throw new Error("staleAfterMinutes must be a number of minutes");
    }
    staleAfterMinutes = input.staleAfterMinutes;
  }

  let exportedAt: string | null = null;
  if (input.exportedAt !== undefined && input.exportedAt !== null) {
    if (typeof input.exportedAt !== "string" || !Number.isFinite(Date.parse(input.exportedAt))) {
      throw new Error("exportedAt must be an ISO-8601 timestamp");
    }
    exportedAt = input.exportedAt;
  }

  const skipped: string[] = [];
  const routines: Routine[] = [];
  const seen = new Set<string>();

  for (const entry of input.routines) {
    if (!isRecord(entry)) {
      skipped.push("entry is not an object");
      continue;
    }
    const id = asString(entry.id);
    const name = asString(entry.name);
    const bot = asString(entry.bot);
    const label = id ?? name ?? "entry";
    if (!id || !name || !bot) {
      skipped.push(`${label}: id, name, and bot are required`);
      continue;
    }
    if (seen.has(id)) {
      skipped.push(`${id}: duplicate id`);
      continue;
    }
    if (entry.status !== "enabled" && entry.status !== "paused") {
      skipped.push(`${id}: status must be enabled or paused`);
      continue;
    }
    const prompt = typeof entry.prompt === "string" ? entry.prompt : null;
    if (prompt === null || prompt.trim().length === 0) {
      skipped.push(`${id}: prompt is required`);
      continue;
    }
    const trigger = readTrigger(entry.trigger, timezone);
    if (typeof trigger === "string") {
      skipped.push(`${id}: ${trigger}`);
      continue;
    }
    let updatedAt: string | null = null;
    if (entry.updatedAt !== undefined && entry.updatedAt !== null) {
      if (typeof entry.updatedAt !== "string" || !Number.isFinite(Date.parse(entry.updatedAt))) {
        skipped.push(`${id}: updatedAt must be an ISO-8601 timestamp`);
        continue;
      }
      updatedAt = entry.updatedAt;
    }
    seen.add(id);
    const status: RoutineStatus = entry.status;
    routines.push({
      id,
      name,
      bot,
      status,
      summary: asString(entry.summary) ?? "",
      prompt,
      updatedAt,
      trigger,
      triggerRaw: entry.trigger,
    });
  }

  return {
    file: {
      version: 1,
      exportedAt,
      timezone,
      staleAfterMinutes,
      routines,
    },
    skipped,
  };
}
