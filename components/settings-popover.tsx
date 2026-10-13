"use client";

import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import type { Locale } from "@/lib/i18n";
import { messages } from "@/lib/i18n";

export function SettingsPopover({
  locale,
  url,
  onApply,
  onUseSample,
}: {
  locale: Locale;
  url: string;
  onApply: (url: string) => void;
  onUseSample: () => void;
}) {
  const text = messages[locale];
  const [draft, setDraft] = useState(url);

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (open) setDraft(url);
      }}
    >
      <Popover.Trigger className="h-10 rounded-full border border-line bg-card px-3 text-sm text-ink">
        {text.settings}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="z-50" sideOffset={8} align="end">
          <Popover.Popup className="w-[min(22rem,calc(100vw-2rem))] rounded-3xl border border-line bg-card p-4 text-ink shadow-[0_16px_40px_rgba(28,25,21,0.12)] outline-none">
            <Popover.Title className="text-base font-semibold">{text.settingsTitle}</Popover.Title>
            <Popover.Description className="mt-1 text-sm leading-6 text-muted">
              {text.settingsHelp}
            </Popover.Description>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                onApply(draft);
              }}
            >
              <label className="block text-sm" htmlFor="data-url">
                {text.dataUrl}
              </label>
              <input
                id="data-url"
                type="url"
                inputMode="url"
                placeholder={text.dataUrlPlaceholder}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="h-11 w-full rounded-2xl border border-line bg-paper px-3 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="h-10 rounded-full bg-teal px-4 text-sm text-white">
                  {text.apply}
                </button>
                <button
                  type="button"
                  className="h-10 rounded-full border border-line px-4 text-sm"
                  onClick={() => {
                    setDraft("");
                    onUseSample();
                  }}
                >
                  {text.useSample}
                </button>
              </div>
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
