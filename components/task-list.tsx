"use client";

import { SelectField } from "@/components/select-field";
import { fill, formatCountdown, type Locale } from "@/lib/i18n";
import { messages } from "@/lib/i18n";
import { explainCron, type BoardModel } from "@/lib/schedule";
import type { Routine, RoutineStatus, TriggerType } from "@/lib/types";

export function TaskList({
  locale,
  now,
  routines,
  board,
  newIds,
  bot,
  status,
  trigger,
  query,
  onBot,
  onStatus,
  onTrigger,
  onQuery,
  onOpen,
}: {
  locale: Locale;
  now: number;
  routines: Routine[];
  board: BoardModel;
  newIds: ReadonlySet<string>;
  bot: string;
  status: "all" | RoutineStatus;
  trigger: "all" | TriggerType;
  query: string;
  onBot: (value: string) => void;
  onStatus: (value: "all" | RoutineStatus) => void;
  onTrigger: (value: "all" | TriggerType) => void;
  onQuery: (value: string) => void;
  onOpen: (id: string) => void;
}) {
  const text = messages[locale];
  const bots = [...new Set(routines.map((routine) => routine.bot))].sort((a, b) => a.localeCompare(b, locale === "zh" ? "zh-CN" : "en"));
  const needle = query.trim().toLowerCase();
  const visible = routines
    .filter((routine) => (bot === "all" ? true : routine.bot === bot))
    .filter((routine) => (status === "all" ? true : routine.status === status))
    .filter((routine) => (trigger === "all" ? true : routine.trigger.type === trigger))
    .filter((routine) => {
      if (!needle) return true;
      const haystack = [
        routine.name,
        routine.bot,
        routine.summary,
        routine.prompt,
        routine.trigger.type === "cron" ? routine.trigger.expression : routine.trigger.path,
        routine.trigger.type === "webhook" ? routine.trigger.description : "",
      ]
        .join("\n")
        .toLowerCase();
      return haystack.includes(needle);
    })
    .sort((a, b) => compareRoutines(a, b, board));

  return (
    <section className="rounded-3xl border border-line bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-semibold">{text.listTitle}</h2>
        <p className="text-sm text-muted">{fill(text.showing, { shown: visible.length, total: routines.length })}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">{text.search}</span>
          <input
            type="search"
            value={query}
            placeholder={text.searchPlaceholder}
            onChange={(event) => onQuery(event.target.value)}
            className="h-10 w-full rounded-full border border-line bg-paper px-4 text-sm"
          />
        </label>
        {query ? (
          <button type="button" className="h-10 rounded-full px-3 text-sm text-muted" onClick={() => onQuery("")}>
            {text.clearSearch}
          </button>
        ) : null}
        <SelectField
          label={text.bot}
          value={bot}
          onChange={onBot}
          options={[{ value: "all", label: text.allBots }, ...bots.map((name) => ({ value: name, label: name }))]}
        />
        <SelectField
          label={text.status}
          value={status}
          onChange={(value) => onStatus(value as "all" | RoutineStatus)}
          options={[
            { value: "all", label: text.allStatuses },
            { value: "enabled", label: text.enabled },
            { value: "paused", label: text.paused },
          ]}
        />
        <SelectField
          label={text.trigger}
          value={trigger}
          onChange={(value) => onTrigger(value as "all" | TriggerType)}
          options={[
            { value: "all", label: text.allTriggers },
            { value: "cron", label: text.cron },
            { value: "webhook", label: text.webhook },
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <div className="px-2 py-14 text-center">
          <p className="text-base font-medium">{text.empty}</p>
          <p className="mt-1 text-sm text-muted">{text.emptyHelp}</p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {visible.map((routine) => {
            const next = board.nextById.get(routine.id) ?? null;
            const explanation =
              routine.trigger.type === "cron"
                ? explainCron(routine.trigger.expression, locale) || text.invalidCron
                : routine.trigger.description || routine.trigger.path || text.eventDriven;
            return (
              <li key={routine.id}>
                <button
                  type="button"
                  onClick={() => onOpen(routine.id)}
                  aria-label={fill(text.openDetails, { name: routine.name })}
                  className="flex w-full items-start gap-3 py-3 text-left"
                >
                  <span
                    className={`mt-1.5 size-2.5 shrink-0 rounded-full ${routine.status === "enabled" ? "bg-moss" : "bg-paper-2"}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{routine.name}</span>
                      {newIds.has(routine.id) ? (
                        <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium text-amber">{text.newBadge}</span>
                      ) : null}
                      <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-muted">
                        {routine.trigger.type === "cron" ? text.cron : text.webhook}
                      </span>
                      <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-muted">
                        {routine.status === "enabled" ? text.enabled : text.paused}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm text-muted">
                      {routine.bot}
                      {" · "}
                      {explanation}
                    </span>
                    {routine.summary ? <span className="mt-1 block truncate text-sm text-ink/80">{routine.summary}</span> : null}
                  </span>
                  <span className="w-36 shrink-0 pt-0.5 text-right">
                    {routine.trigger.type === "cron" && next ? (
                      <span className={`block font-mono text-sm tabular-nums ${routine.status === "paused" ? "text-muted" : "text-teal-deep"}`}>
                        {formatCountdown(next.getTime() - now, locale)}
                      </span>
                    ) : (
                      <span className="block text-sm text-muted">{text.webhook}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function compareRoutines(a: Routine, b: Routine, board: BoardModel): number {
  const rank = (routine: Routine) => {
    const next = board.nextById.get(routine.id);
    if (routine.status === "enabled" && routine.trigger.type === "cron") return next ? next.getTime() : Number.MAX_SAFE_INTEGER - 3;
    if (routine.status === "enabled") return Number.MAX_SAFE_INTEGER - 2;
    if (routine.trigger.type === "cron") return next ? next.getTime() + 1e15 : Number.MAX_SAFE_INTEGER - 1;
    return Number.MAX_SAFE_INTEGER;
  };
  const delta = rank(a) - rank(b);
  if (delta !== 0) return delta;
  return a.name.localeCompare(b.name);
}
