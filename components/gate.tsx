"use client";

import { useState } from "react";
import { GATE_KEY } from "@/lib/preferences";
import type { Locale } from "@/lib/i18n";
import { messages } from "@/lib/i18n";

export function Gate({
  locale,
  password,
  onUnlock,
}: {
  locale: Locale;
  password: string;
  onUnlock: () => void;
}) {
  const text = messages[locale];
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <p className="font-mono text-xs text-teal">Bot routines</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{text.gateTitle}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">{text.gateBody}</p>
      <form
        className="mt-6 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (value === password) {
            window.sessionStorage.setItem(GATE_KEY, "1");
            onUnlock();
            return;
          }
          setWrong(true);
        }}
      >
        <label className="block text-sm" htmlFor="gate-password">
          {text.gatePassword}
        </label>
        <input
          id="gate-password"
          type="password"
          autoComplete="current-password"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setWrong(false);
          }}
          className="h-11 w-full rounded-2xl border border-line bg-card px-3 text-sm"
        />
        {wrong ? (
          <p role="alert" className="text-sm text-rose">
            {text.gateError}
          </p>
        ) : null}
        <button type="submit" className="h-11 rounded-full bg-ink px-5 text-sm text-card">
          {text.gateSubmit}
        </button>
      </form>
    </main>
  );
}
