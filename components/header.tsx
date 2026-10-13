"use client";

import { SelectField } from "@/components/select-field";
import { SettingsPopover } from "@/components/settings-popover";
import { relativeTime, type Locale } from "@/lib/i18n";
import { messages } from "@/lib/i18n";
import { TIME_ZONES, timeZoneLabel } from "@/lib/preferences";
import { formatDateTime } from "@/lib/time";

export function Header({
  locale,
  onLocale,
  timeZone,
  onTimeZone,
  source,
  dataUrl,
  onApplyUrl,
  onUseSample,
  exportedAt,
  fetchedAt,
  now,
}: {
  locale: Locale;
  onLocale: (locale: Locale) => void;
  timeZone: string;
  onTimeZone: (timeZone: string) => void;
  source: "sample" | "remote" | "synced";
  dataUrl: string;
  onApplyUrl: (url: string) => void;
  onUseSample: () => void;
  exportedAt: string | null;
  fetchedAt: number | null;
  now: number;
}) {
  const text = messages[locale];
  const zones = TIME_ZONES.includes(timeZone as (typeof TIME_ZONES)[number])
    ? [...TIME_ZONES]
    : [timeZone, ...TIME_ZONES];
  const exportedLabel =
    exportedAt && Number.isFinite(Date.parse(exportedAt))
      ? formatDateTime(new Date(exportedAt), timeZone, locale)
      : text.unknownExport;

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <div className="mr-auto flex min-w-0 items-center gap-3">
          <span className="grid size-9 place-items-center rounded-2xl bg-teal text-white" aria-hidden="true">
            <span className="size-2 rounded-full bg-amber-soft" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold tracking-tight">{text.title}</p>
            <p className="truncate text-sm text-muted">{text.subtitle}</p>
          </div>
        </div>
        <SelectField
          label={text.timezone}
          value={timeZone}
          onChange={onTimeZone}
          options={zones.map((zone) => ({ value: zone, label: timeZoneLabel(zone, locale) }))}
        />
        <div role="group" aria-label={text.language} className="flex rounded-full border border-line bg-card p-0.5">
          <button
            type="button"
            aria-pressed={locale === "zh"}
            onClick={() => onLocale("zh")}
            className={locale === "zh" ? "rounded-full bg-ink px-3 py-1.5 text-sm text-card" : "rounded-full px-3 py-1.5 text-sm text-muted"}
          >
            中文
          </button>
          <button
            type="button"
            aria-pressed={locale === "en"}
            onClick={() => onLocale("en")}
            className={locale === "en" ? "rounded-full bg-ink px-3 py-1.5 text-sm text-card" : "rounded-full px-3 py-1.5 text-sm text-muted"}
          >
            EN
          </button>
        </div>
        <SettingsPopover locale={locale} url={dataUrl} onApply={onApplyUrl} onUseSample={onUseSample} />
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-3 text-sm text-muted">
        <span className="rounded-full bg-teal-soft px-2 py-0.5 text-teal-deep">
          {source === "sample" ? text.sampleSource : source === "synced" ? text.syncedSource : text.remoteSource}
        </span>
        <span>
          {text.exported} {exportedLabel}
        </span>
        {fetchedAt ? (
          <span>
            {text.fetched} {relativeTime(fetchedAt, now, locale)}
          </span>
        ) : null}
        <span className="font-mono text-xs">{timeZone}</span>
      </div>
    </header>
  );
}
