"use client";

import { fill, formatCountdown, type Locale } from "@/lib/i18n";
import { messages } from "@/lib/i18n";
import { explainCron, type BoardModel } from "@/lib/schedule";
import { formatClock, formatMonthDay, formatWeekday } from "@/lib/time";
import type { Routine } from "@/lib/types";

export function Overview({
  locale,
  timeZone,
  now,
  routines,
  board,
  onOpen,
}: {
  locale: Locale;
  timeZone: string;
  now: number;
  routines: Routine[];
  board: BoardModel;
  onOpen: (id: string) => void;
}) {
  const text = messages[locale];
  const byId = new Map(routines.map((routine) => [routine.id, routine]));
  const enabled = routines.filter((routine) => routine.status === "enabled").length;
  const paused = routines.length - enabled;
  const cronCount = routines.filter((routine) => routine.trigger.type === "cron").length;
  const webhookCount = routines.length - cronCount;
  const heroRoutine = board.hero ? byId.get(board.hero.routineId) : undefined;
  const todayKey = board.days[0]?.key;
  const tomorrowKey = board.days[1]?.key;

  const stats = [
    [text.statRoutines, routines.length],
    [text.statEnabled, enabled],
    [text.statPaused, paused],
    [text.statCron, cronCount],
    [text.statWebhook, webhookCount],
    [text.statUpcoming, board.upcoming24h],
  ] as const;

  return (
    <section className="space-y-4">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-card px-3 py-3">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-1 font-mono text-2xl font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted">{text.nextRun}</p>
            {heroRoutine && board.hero ? (
              <>
                <button
                  type="button"
                  className="mt-1 block max-w-full truncate text-left text-2xl font-semibold tracking-tight"
                  onClick={() => onOpen(heroRoutine.id)}
                >
                  {heroRoutine.name}
                </button>
                <p className="mt-1 text-sm text-muted">
                  {heroRoutine.bot}
                  {" · "}
                  {heroRoutine.trigger.type === "cron"
                    ? explainCron(heroRoutine.trigger.expression, locale) || heroRoutine.trigger.expression
                    : text.webhook}
                  {" · "}
                  {formatClock(board.hero.at, timeZone, locale)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-2xl font-semibold tracking-tight">{text.noNextRun}</p>
            )}
          </div>
          {board.hero ? (
            <p className="font-mono text-4xl font-medium tabular-nums tracking-tight text-teal-deep sm:text-5xl">
              {formatCountdown(board.hero.at.getTime() - now, locale)}
            </p>
          ) : null}
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">{text.timeline}</h2>
            <p className="text-sm text-muted">{text.timelineHelp}</p>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {board.days.map((day) => {
              const label =
                day.key === todayKey ? text.today : day.key === tomorrowKey ? text.tomorrow : formatWeekday(day.start, timeZone, locale);
              return (
                <section
                  key={day.key}
                  className={`min-w-40 flex-1 rounded-2xl border px-2.5 py-2 ${day.key === todayKey ? "border-teal/40 bg-teal-soft/60" : "border-line bg-paper"}`}
                  aria-label={label}
                >
                  <header className="mb-2">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted">{formatMonthDay(day.start, timeZone, locale)}</p>
                  </header>
                  {day.runs.length === 0 ? (
                    <p className="text-xs text-muted">{text.noRuns}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {day.runs.map((run) => {
                        const routine = byId.get(run.routineId);
                        if (!routine) return null;
                        const past = run.at.getTime() < now;
                        return (
                          <li key={`${run.routineId}-${run.at.toISOString()}`}>
                            <button
                              type="button"
                              onClick={() => onOpen(routine.id)}
                              className={`w-full rounded-xl px-2 py-1.5 text-left ${routine.status === "paused" ? "border border-dashed border-line" : "bg-card"} ${past ? "opacity-55" : ""}`}
                            >
                              <span className="block font-mono text-xs tabular-nums">{formatClock(run.at, timeZone, locale)}</span>
                              <span className="block truncate text-sm">{routine.name}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {day.hidden > 0 ? (
                    <p className="mt-2 text-xs text-muted">{fill(text.moreRuns, { n: day.hidden })}</p>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
