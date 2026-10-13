"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Gate, UnconfiguredNotice } from "@/components/gate";
import { Header } from "@/components/header";
import { Overview } from "@/components/overview";
import { TaskDrawer } from "@/components/task-drawer";
import { TaskList } from "@/components/task-list";
import { fill, messages, type Locale } from "@/lib/i18n";
import { parseRoutines } from "@/lib/parse";
import {
  DATA_URL_KEY,
  DEFAULT_TIME_ZONE,
  GATE_KEY,
  LOCALE_KEY,
  POLL_INTERVAL_MS,
  TIME_ZONE_KEY,
  gatePassword,
  sampleDataUrl,
} from "@/lib/preferences";
import { buildBoard } from "@/lib/schedule";
import { isValidTimeZone } from "@/lib/time";
import type { RoutinesFile, RoutineStatus, TriggerType } from "@/lib/types";
import { isWorkerBacked, lockWorkerGate, openGate, readGate, subscribeGate } from "@/lib/worker-auth";

type Snapshot = {
  file: RoutinesFile;
  skipped: string[];
  source: "sample" | "remote" | "synced";
  error: string | null;
  fetchedAt: number;
};

function readLocale(): Locale {
  return window.localStorage.getItem(LOCALE_KEY) === "en" ? "en" : "zh";
}

function readZone(): string {
  const stored = window.localStorage.getItem(TIME_ZONE_KEY) ?? "";
  return stored && isValidTimeZone(stored) ? stored : "";
}

function readSourceUrl(): string {
  const fromQuery = new URLSearchParams(window.location.search).get("data")?.trim();
  if (fromQuery) return fromQuery;
  return window.localStorage.getItem(DATA_URL_KEY)?.trim() ?? "";
}

function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function Dashboard() {
  const isClient = useIsClient();
  if (!isClient) return <DashboardSkeleton />;
  return <DashboardClient />;
}

function DashboardClient() {
  const clientPassword = gatePassword();
  const clientUnlocked = window.sessionStorage.getItem(GATE_KEY) === "1";
  const gate = useSyncExternalStore(
    (listener) => subscribeGate(clientPassword, clientUnlocked, listener),
    readGate,
    () => "checking" as const,
  );
  const locale = readLocale();
  if (gate === "checking") return <DashboardSkeleton />;
  if (gate === "unconfigured") return <UnconfiguredNotice locale={locale} />;
  if (gate === "client") {
    return (
      <Gate
        locale={locale}
        mode="client"
        password={clientPassword}
        onUnlock={() => {
          window.sessionStorage.setItem(GATE_KEY, "1");
          openGate();
        }}
      />
    );
  }
  if (gate === "worker") {
    return <Gate locale={locale} mode="worker" onUnlock={() => openGate()} />;
  }
  return <DashboardLive />;
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl animate-pulse px-4 py-6" aria-hidden="true">
      <div className="h-12 w-56 rounded-full bg-paper-2" />
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-20 rounded-2xl border border-line bg-card" />
        ))}
      </div>
      <div className="mt-4 h-72 rounded-3xl border border-line bg-card" />
    </div>
  );
}

function DashboardLive() {
  const [locale, setLocale] = useState<Locale>(readLocale);
  const [chosenZone, setChosenZone] = useState(readZone);
  const [sourceUrl, setSourceUrl] = useState(readSourceUrl);
  const [reloadKey, setReloadKey] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bot, setBot] = useState("all");
  const [status, setStatus] = useState<"all" | RoutineStatus>("all");
  const [trigger, setTrigger] = useState<"all" | TriggerType>("all");
  const [query, setQuery] = useState("");
  const seen = useRef<Set<string> | null>(null);
  const text = messages[locale];

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.title = text.title;
  }, [locale, text.title]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const token = { current: true };
    seen.current = null;

    async function readJson(url: string): Promise<Snapshot> {
      const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401 && isWorkerBacked() && url === sampleDataUrl()) {
        lockWorkerGate();
        throw new Error("unauthorized");
      }
      if (!response.ok) throw new Error(String(response.status));
      const body: unknown = await response.json();
      const parsed = parseRoutines(body);
      const source = url !== sampleDataUrl() ? "remote" : isWorkerBacked() ? "synced" : "sample";
      return {
        file: parsed.file,
        skipped: parsed.skipped,
        source,
        error: null,
        fetchedAt: Date.now(),
      };
    }

    async function load(first: boolean) {
      if (first) setLoading(true);
      const remote = sourceUrl.trim();
      try {
        const next = await readJson(remote || sampleDataUrl());
        if (!token.current) return;
        accept(next, first);
        setFatalError(null);
      } catch (error) {
        if (!token.current) return;
        const message = error instanceof Error ? error.message : "error";
        if (message === "unauthorized") return;
        if (remote && first) {
          try {
            const sample = await readJson(sampleDataUrl());
            if (!token.current) return;
            accept({ ...sample, source: "sample", error: message }, true);
            setFatalError(null);
            return;
          } catch {
            // The bundled sample failed too. Surface the original error below.
          }
        }
        if (first) {
          setSnapshot(null);
          setFatalError(message);
        } else {
          setSnapshot((current) => (current ? { ...current, error: message } : current));
        }
      } finally {
        if (token.current) setLoading(false);
      }
    }

    function accept(next: Snapshot, first: boolean) {
      const ids = next.file.routines.map((routine) => routine.id);
      if (first || seen.current === null) {
        seen.current = new Set(ids);
        setNewIds(new Set());
      } else {
        const fresh = ids.filter((id) => !seen.current?.has(id));
        for (const id of ids) seen.current.add(id);
        if (fresh.length > 0) {
          setNewIds((current) => {
            const merged = new Set(current);
            for (const id of fresh) merged.add(id);
            return merged;
          });
        }
      }
      setSnapshot(next);
    }

    void load(true);
    const timer = window.setInterval(() => void load(false), POLL_INTERVAL_MS);
    return () => {
      token.current = false;
      window.clearInterval(timer);
    };
  }, [sourceUrl, reloadKey]);

  const file = snapshot?.file ?? null;
  const displayZone = chosenZone || file?.timezone || DEFAULT_TIME_ZONE;
  const board = useMemo(
    () => (file ? buildBoard(file, displayZone, new Date(now)) : null),
    [file, displayZone, now],
  );
  const active = file?.routines.find((routine) => routine.id === activeId) ?? null;
  const exportedMs = file?.exportedAt ? Date.parse(file.exportedAt) : Number.NaN;
  const stale =
    file !== null && Number.isFinite(exportedMs) && now - exportedMs > file.staleAfterMinutes * 60_000;

  function persistUrl(next: string) {
    const trimmed = next.trim();
    setSourceUrl(trimmed);
    if (trimmed) window.localStorage.setItem(DATA_URL_KEY, trimmed);
    else window.localStorage.removeItem(DATA_URL_KEY);
  }

  return (
    <div className="min-h-dvh">
      <Header
        locale={locale}
        onLocale={(next) => {
          setLocale(next);
          window.localStorage.setItem(LOCALE_KEY, next);
        }}
        timeZone={displayZone}
        onTimeZone={(next) => {
          setChosenZone(next);
          window.localStorage.setItem(TIME_ZONE_KEY, next);
        }}
        source={snapshot?.source ?? "sample"}
        dataUrl={sourceUrl}
        onApplyUrl={persistUrl}
        onUseSample={() => persistUrl("")}
        exportedAt={file?.exportedAt ?? null}
        fetchedAt={snapshot?.fetchedAt ?? null}
        now={now}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5">
        {stale && file ? (
          <div role="status" className="rounded-2xl border border-amber/30 bg-amber-soft px-4 py-3 text-sm text-amber">
            <p className="font-medium">{text.staleTitle}</p>
            <p className="mt-1">
              {fill(text.staleBody, {
                when: file.exportedAt ?? text.unknownExport,
                minutes: file.staleAfterMinutes,
              })}
            </p>
          </div>
        ) : null}
        {snapshot?.error && snapshot.source === "sample" ? (
          <div role="status" className="rounded-2xl border border-rose/20 bg-rose-soft px-4 py-3 text-sm text-rose">
            <p className="font-medium">{text.fallbackNotice}</p>
            <p className="mt-1">{snapshot.error}</p>
          </div>
        ) : null}
        {snapshot?.error && snapshot.source === "remote" ? (
          <div role="status" className="rounded-2xl border border-rose/20 bg-rose-soft px-4 py-3 text-sm text-rose">
            <p className="font-medium">{text.loadError}</p>
            <p className="mt-1">{snapshot.error}</p>
          </div>
        ) : null}
        {snapshot && snapshot.skipped.length > 0 ? (
          <details className="rounded-2xl border border-line bg-card px-4 py-3 text-sm text-muted">
            <summary>{fill(text.skipped, { n: snapshot.skipped.length })}</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {snapshot.skipped.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </details>
        ) : null}
        {fatalError && !file ? (
          <div className="rounded-3xl border border-line bg-card px-5 py-10 text-center">
            <p className="font-medium">{text.loadError}</p>
            <p className="mt-1 text-sm text-muted">{fatalError}</p>
            <button
              type="button"
              className="mt-4 rounded-full bg-ink px-4 py-2 text-sm text-card"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              {text.retry}
            </button>
          </div>
        ) : null}
        {loading && !file ? <DashboardSkeleton /> : null}
        {file && board ? (
          <>
            <Overview
              locale={locale}
              timeZone={displayZone}
              now={now}
              routines={file.routines}
              board={board}
              onOpen={(id) => {
                setActiveId(id);
                setNewIds((current) => {
                  if (!current.has(id)) return current;
                  const next = new Set(current);
                  next.delete(id);
                  return next;
                });
              }}
            />
            <TaskList
              locale={locale}
              now={now}
              routines={file.routines}
              board={board}
              newIds={newIds}
              bot={bot}
              status={status}
              trigger={trigger}
              query={query}
              onBot={setBot}
              onStatus={setStatus}
              onTrigger={setTrigger}
              onQuery={setQuery}
              onOpen={(id) => {
                setActiveId(id);
                setNewIds((current) => {
                  if (!current.has(id)) return current;
                  const next = new Set(current);
                  next.delete(id);
                  return next;
                });
              }}
            />
          </>
        ) : null}
        {snapshot?.source === "sample" ? (
          <p className="pb-6 text-center text-xs text-muted">{text.footer}</p>
        ) : (
          <div className="pb-6" />
        )}
      </main>
      <TaskDrawer
        locale={locale}
        timeZone={displayZone}
        fileZone={file?.timezone ?? displayZone}
        now={now}
        routine={active}
        onClose={() => setActiveId(null)}
      />
    </div>
  );
}
