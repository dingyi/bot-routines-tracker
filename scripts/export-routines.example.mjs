#!/usr/bin/env node
/**
 * Example exporter.
 *
 * Adapt `SOURCE` to whatever your own scheduler returns, then write a
 * routines.json the dashboard understands. This file does not connect to
 * any service. The jobs below are placeholders with the same shape as a
 * typical internal export.
 *
 *   node scripts/export-routines.example.mjs > public/routines.json
 */

/** @typedef {{ id: string, title: string, owner: string, state: "on" | "off", note: string, instructions: string, when: { kind: "cron", expression: string, timezone?: string } | { kind: "hook", path: string, note?: string } }} SourceJob */

/** @type {SourceJob[]} */
const SOURCE = [
  {
    id: "example-morning",
    title: "Morning note",
    owner: "Example Bot",
    state: "on",
    note: "A short weekday note.",
    instructions: "Summarize the titles you were given. Do not add facts.",
    when: { kind: "cron", expression: "0 8 * * 1-5" },
  },
  {
    id: "example-hook",
    title: "Inbound event",
    owner: "Example Bot",
    state: "off",
    note: "Runs only when something calls the hook.",
    instructions: "Restate the event in four lines.",
    when: { kind: "hook", path: "/hooks/example", note: "Called by the example form." },
  },
];

function toRoutine(job) {
  const trigger =
    job.when.kind === "cron"
      ? {
          type: "cron",
          expression: job.when.expression,
          ...(job.when.timezone ? { timezone: job.when.timezone } : {}),
        }
      : {
          type: "webhook",
          path: job.when.path,
          ...(job.when.note ? { description: job.when.note } : {}),
        };

  return {
    id: job.id,
    name: job.title,
    bot: job.owner,
    status: job.state === "on" ? "enabled" : "paused",
    summary: job.note,
    prompt: job.instructions,
    updatedAt: new Date().toISOString(),
    trigger,
  };
}

const file = {
  version: 1,
  exportedAt: new Date().toISOString(),
  timezone: "Asia/Shanghai",
  staleAfterMinutes: 180,
  routines: SOURCE.map(toRoutine),
};

process.stdout.write(`${JSON.stringify(file, null, 2)}\n`);
