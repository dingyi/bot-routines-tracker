"use client";

import { useState } from "react";
import { messages, type Locale } from "@/lib/i18n";
import { GATE_KEY, apiUrl } from "@/lib/preferences";

export function UnconfiguredNotice({ locale }: { locale: Locale }) {
  const text = messages[locale];
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <p className="font-mono text-xs text-teal">Bot routines</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{text.gateUnconfiguredTitle}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">{text.gateUnconfiguredBody}</p>
    </main>
  );
}

export function Gate({
  locale,
  mode,
  password,
  onUnlock,
}: {
  locale: Locale;
  mode: "client" | "worker";
  password?: string;
  onUnlock: () => void;
}) {
  const text = messages[locale];
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <p className="font-mono text-xs text-teal">Bot routines</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{text.gateTitle}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">{mode === "worker" ? text.gateBodyWorker : text.gateBody}</p>
      <form
        className="mt-6 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          if (mode === "client") {
            if (password && value === password) {
              window.sessionStorage.setItem(GATE_KEY, "1");
              onUnlock();
              return;
            }
            setWrong(true);
            return;
          }
          setPending(true);
          void fetch(apiUrl("/api/session"), {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ password: value }),
          })
            .then((response) => {
              if (response.ok) {
                onUnlock();
                return;
              }
              setWrong(true);
            })
            .catch(() => setWrong(true))
            .finally(() => setPending(false));
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
        <button type="submit" className="h-11 rounded-full bg-ink px-5 text-sm text-card" disabled={pending}>
          {text.gateSubmit}
        </button>
      </form>
    </main>
  );
}
