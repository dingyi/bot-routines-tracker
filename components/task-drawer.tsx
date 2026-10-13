"use client";

import { useMemo } from "react";
import { Drawer } from "@base-ui/react/drawer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatCountdown, type Locale } from "@/lib/i18n";
import { messages } from "@/lib/i18n";
import { explainCron, routineZone, runsBetween } from "@/lib/schedule";
import { formatDateTime } from "@/lib/time";
import type { Routine } from "@/lib/types";

export function TaskDrawer({
  locale,
  timeZone,
  fileZone,
  now,
  routine,
  onClose,
}: {
  locale: Locale;
  timeZone: string;
  fileZone: string;
  now: number;
  routine: Routine | null;
  onClose: () => void;
}) {
  const text = messages[locale];
  const upcoming = useMemo(() => {
    if (!routine || routine.trigger.type !== "cron") return [];
    try {
      const end = new Date(now + 45 * 24 * 60 * 60 * 1000);
      return runsBetween(routine.trigger.expression, routineZone(routine, fileZone), new Date(now), end).slice(0, 5);
    } catch {
      return [];
    }
  }, [routine, fileZone, now]);

  const explanation =
    routine?.trigger.type === "cron" ? explainCron(routine.trigger.expression, locale) : "";

  return (
    <Drawer.Root
      open={routine !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      swipeDirection="right"
    >
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 min-h-dvh bg-ink/30 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />
        <Drawer.Viewport className="fixed inset-0 z-40 flex items-stretch justify-end">
          <Drawer.Popup className="h-full w-full max-w-xl overflow-y-auto overscroll-contain bg-card p-5 text-ink shadow-2xl outline-none transition-transform duration-300 [transform:translateX(var(--drawer-swipe-movement-x))] data-ending-style:[transform:translateX(100%)] data-starting-style:[transform:translateX(100%)] data-swiping:select-none sm:p-7">
            {routine ? (
              <Drawer.Content>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted">
                      {routine.bot}
                      {" · "}
                      {routine.status === "enabled" ? text.enabled : text.paused}
                      {" · "}
                      {routine.trigger.type === "cron" ? text.cron : text.webhook}
                    </p>
                    <Drawer.Title className="mt-1 text-2xl font-semibold tracking-tight">{routine.name}</Drawer.Title>
                    <Drawer.Description className="mt-2 text-sm leading-6 text-muted">
                      {routine.summary || text.timelineHelp}
                    </Drawer.Description>
                  </div>
                  <Drawer.Close className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm">
                    {text.close}
                  </Drawer.Close>
                </div>

                <dl className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-paper px-3 py-3">
                    <dt className="text-xs text-muted">{text.schedule}</dt>
                    <dd className="mt-1 text-sm">
                      {routine.trigger.type === "cron" ? (
                        <>
                          <span className="block font-mono text-xs">{routine.trigger.expression}</span>
                          <span className="mt-1 block">{explanation || text.invalidCron}</span>
                          <span className="mt-1 block text-muted">{routineZone(routine, fileZone)}</span>
                        </>
                      ) : (
                        <>
                          <span className="block">{text.eventDriven}</span>
                          {routine.trigger.path ? (
                            <span className="mt-1 block font-mono text-xs">{routine.trigger.path}</span>
                          ) : null}
                        </>
                      )}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-paper px-3 py-3">
                    <dt className="text-xs text-muted">{text.nextRun}</dt>
                    <dd className="mt-1">
                      {routine.trigger.type === "cron" && upcoming[0] ? (
                        <>
                          <span className="block font-mono text-2xl tabular-nums text-teal-deep">
                            {formatCountdown(upcoming[0].getTime() - now, locale)}
                          </span>
                          <span className="mt-1 block text-sm text-muted">
                            {formatDateTime(upcoming[0], timeZone, locale)}
                          </span>
                          {routine.status === "paused" ? <span className="mt-1 block text-sm text-amber">{text.pausedHint}</span> : null}
                        </>
                      ) : (
                        <span className="text-sm">{text.eventDriven}</span>
                      )}
                    </dd>
                  </div>
                </dl>

                {upcoming.length > 1 ? (
                  <div className="mt-4">
                    <h3 className="text-sm font-medium">{text.nextOccurrences}</h3>
                    <ul className="mt-2 space-y-1 text-sm">
                      {upcoming.map((at) => (
                        <li key={at.toISOString()} className="font-mono tabular-nums text-muted">
                          {formatDateTime(at, timeZone, locale)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <p className="mt-4 font-mono text-xs text-muted">
                  {text.idLabel} {routine.id}
                  {routine.updatedAt ? ` · ${text.updated} ${formatDateTime(new Date(routine.updatedAt), timeZone, locale)}` : ""}
                </p>

                <h3 className="mt-8 text-sm font-medium">{text.prompt}</h3>
                <div className="prompt mt-2 text-sm leading-6">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noreferrer">
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {routine.prompt}
                  </ReactMarkdown>
                </div>

                <h3 className="mt-8 text-sm font-medium">{text.rawTrigger}</h3>
                <pre className="mt-2 overflow-auto rounded-2xl bg-ink p-4 font-mono text-xs leading-5 text-[#f6f1e7]">
                  {JSON.stringify(routine.triggerRaw, null, 2)}
                </pre>
              </Drawer.Content>
            ) : null}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
