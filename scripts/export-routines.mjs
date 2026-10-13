#!/usr/bin/env node
/**
 * Read Grok Bot agent files and write a routines.json document.
 *
 * Layout (AGENTS_ROOT defaults to the AGENTS_ROOT environment variable):
 *   <AGENTS_ROOT>/<agent>/profile.json
 *   <AGENTS_ROOT>/<agent>/automations/<routine>/automation.json
 *
 * The script does not call the network. Upload is a separate step.
 *
 *   AGENTS_ROOT=/home/box/agent-data/agents node scripts/export-routines.mjs --out routines.json
 */

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Cron } from "croner";

const SECRET_KEY = /token|secret|password|authorization|api[-_]?key|credential/i;
const EVENT_KINDS = new Set(["webhook", "hook", "event", "slack", "github", "http"]);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {Record<string, unknown>} record
 * @param {string[]} keys
 */
function pickString(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

/**
 * @param {string} timeZone
 */
function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} expression
 * @param {string} timeZone
 */
function cronWorks(expression, timeZone) {
  try {
    const cron = new Cron(expression, {
      timezone: timeZone,
      paused: true,
      unref: true,
      legacyMode: true,
    });
    cron.stop();
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Record<string, unknown>} record
 * @returns {"enabled" | "paused"}
 */
function readStatus(record) {
  const status = pickString(record, ["status", "state"]);
  if (status) {
    const normalized = status.toLowerCase();
    if (normalized === "enabled" || normalized === "active" || normalized === "on" || normalized === "running") {
      return "enabled";
    }
    if (normalized === "paused" || normalized === "disabled" || normalized === "off" || normalized === "inactive") {
      return "paused";
    }
  }
  if (record.enabled === false || record.paused === true || record.disabled === true) return "paused";
  return "enabled";
}

/**
 * @param {Record<string, unknown> | null} source
 */
function plainFields(source) {
  /** @type {Record<string, string | number | boolean | null>} */
  const copy = {};
  if (!source) return copy;
  for (const [key, value] of Object.entries(source)) {
    if (SECRET_KEY.test(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      copy[key] = value;
    }
  }
  return copy;
}

/**
 * @param {Record<string, unknown>} record
 * @param {string} fallbackZone
 * @returns {Record<string, unknown> | string}
 */
function readTrigger(record, fallbackZone) {
  const source = isRecord(record.trigger) ? record.trigger : isRecord(record.schedule) ? record.schedule : null;
  const expression =
    (source && pickString(source, ["expression", "cron", "expr", "schedule"])) ||
    pickString(record, ["cron", "expression", "expr"]);
  const kind = ((source && pickString(source, ["type", "kind"])) || (expression ? "cron" : "")).toLowerCase();
  const timezone =
    (source && pickString(source, ["timezone", "timeZone", "tz"])) || pickString(record, ["timezone", "timeZone", "tz"]);

  if (kind === "cron" || kind === "schedule") {
    if (!expression) return "cron expression is missing";
    const zone = timezone ?? fallbackZone;
    if (!isValidTimeZone(zone)) return "unknown timezone";
    if (!cronWorks(expression, zone)) return "invalid cron expression";
    /** @type {Record<string, unknown>} */
    const trigger = { ...plainFields(source), type: "cron", expression };
    if (timezone) trigger.timezone = timezone;
    return trigger;
  }

  if (EVENT_KINDS.has(kind) || source) {
    const pathValue = source ? pickString(source, ["path", "url", "channel"]) : null;
    const description =
      (source && pickString(source, ["description", "note", "summary"])) || (kind && kind !== "webhook" ? kind : null);
    /** @type {Record<string, unknown>} */
    const trigger = { ...plainFields(source), type: "webhook" };
    if (pathValue) trigger.path = pathValue;
    if (description && trigger.description === undefined) trigger.description = description;
    return trigger;
  }

  return "trigger is missing";
}

/**
 * @param {unknown} raw
 * @param {{ agentId: string, automationId: string, bot: string, fallbackZone: string }} context
 * @returns {Record<string, unknown> | string}
 */
export function mapAutomation(raw, context) {
  if (!isRecord(raw)) return "automation.json is not an object";
  const prompt = pickString(raw, ["prompt", "instructions", "instruction", "body"]);
  if (!prompt) return "prompt is missing";
  const trigger = readTrigger(raw, context.fallbackZone);
  if (typeof trigger === "string") return trigger;
  const updatedAt = pickString(raw, ["updatedAt", "updated_at", "modifiedAt"]);
  if (updatedAt && !Number.isFinite(Date.parse(updatedAt))) return "updatedAt is not a timestamp";
  const name = pickString(raw, ["name", "title"]) ?? context.automationId;
  /** @type {Record<string, unknown>} */
  const routine = {
    id: `${context.agentId}/${context.automationId}`,
    name,
    bot: context.bot,
    status: readStatus(raw),
    prompt,
    trigger,
  };
  const summary = pickString(raw, ["summary", "note"]);
  if (summary) routine.summary = summary;
  if (updatedAt) routine.updatedAt = updatedAt;
  return routine;
}

/**
 * @param {string} agentPath
 * @param {string} fallback
 */
async function readBotName(agentPath, fallback) {
  try {
    const raw = JSON.parse(await readFile(path.join(agentPath, "profile.json"), "utf8"));
    if (isRecord(raw)) {
      const name = pickString(raw, ["name", "displayName", "title"]);
      if (name) return name;
    }
  } catch {
    // A missing profile still exports routines, labeled with the folder name.
  }
  return fallback;
}

/**
 * @param {string} root
 * @param {{ timezone?: string, staleAfterMinutes?: number, now?: Date }} [options]
 */
export async function exportRoutines(root, options = {}) {
  const timezone = options.timezone ?? "Asia/Shanghai";
  if (!isValidTimeZone(timezone)) {
    throw new Error(`Unknown timezone: ${timezone}`);
  }
  const staleAfterMinutes = options.staleAfterMinutes ?? 45;
  if (!Number.isFinite(staleAfterMinutes) || staleAfterMinutes < 1) {
    throw new Error("staleAfterMinutes must be a positive number");
  }
  const now = options.now ?? new Date();
  const agentsDir = path.resolve(root);
  const dirStat = await stat(agentsDir);
  if (!dirStat.isDirectory()) {
    throw new Error("AGENTS_ROOT is not a directory");
  }

  /** @type {string[]} */
  const skipped = [];
  /** @type {Record<string, unknown>[]} */
  const routines = [];
  const seen = new Set();
  const agentEntries = await readdir(agentsDir, { withFileTypes: true });

  for (const agentEntry of agentEntries) {
    if (!agentEntry.isDirectory() || agentEntry.name.startsWith(".")) continue;
    const agentPath = path.join(agentsDir, agentEntry.name);
    const bot = await readBotName(agentPath, agentEntry.name);
    let automationEntries;
    try {
      automationEntries = await readdir(path.join(agentPath, "automations"), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const automationEntry of automationEntries) {
      if (!automationEntry.isDirectory() || automationEntry.name.startsWith(".")) continue;
      const label = `${agentEntry.name}/${automationEntry.name}`;
      const filePath = path.join(agentPath, "automations", automationEntry.name, "automation.json");
      let raw;
      try {
        raw = JSON.parse(await readFile(filePath, "utf8"));
      } catch {
        skipped.push(`${label}: unreadable automation.json`);
        continue;
      }
      const mapped = mapAutomation(raw, {
        agentId: agentEntry.name,
        automationId: automationEntry.name,
        bot,
        fallbackZone: timezone,
      });
      if (typeof mapped === "string") {
        skipped.push(`${label}: ${mapped}`);
        continue;
      }
      const id = mapped.id;
      if (typeof id === "string" && seen.has(id)) {
        skipped.push(`${label}: duplicate id`);
        continue;
      }
      if (typeof id === "string") seen.add(id);
      routines.push(mapped);
    }
  }

  routines.sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return {
    file: {
      version: 1,
      exportedAt: now.toISOString(),
      timezone,
      staleAfterMinutes,
      routines,
    },
    skipped,
  };
}

/**
 * @param {string[]} argv
 */
function readArgs(argv) {
  /** @type {{ root: string | null, out: string | null, timezone: string | null, stale: number | null }} */
  const args = { root: null, out: null, timezone: null, stale: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--root" && next) {
      args.root = next;
      index += 1;
    } else if (token === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (token === "--timezone" && next) {
      args.timezone = next;
      index += 1;
    } else if (token === "--stale-minutes" && next) {
      args.stale = Number(next);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  return args;
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const root = args.root ?? process.env.AGENTS_ROOT ?? "";
  if (!root) {
    throw new Error("Set AGENTS_ROOT or pass --root");
  }
  const staleFromEnv = process.env.STALE_AFTER_MINUTES ? Number(process.env.STALE_AFTER_MINUTES) : undefined;
  const result = await exportRoutines(root, {
    timezone: args.timezone ?? process.env.ROUTINES_TIMEZONE ?? undefined,
    staleAfterMinutes: args.stale ?? staleFromEnv,
  });
  if (result.file.routines.length === 0 && result.skipped.length > 0) {
    process.stderr.write(`export failed: 0 routines, ${result.skipped.length} skipped\n`);
    process.exitCode = 1;
    return;
  }
  const json = `${JSON.stringify(result.file, null, 2)}\n`;
  if (args.out) await writeFile(args.out, json);
  else process.stdout.write(json);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "export failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
