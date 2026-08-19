"use client";

import { useEffect, useRef, useState } from "react";
import { buttonPrimaryClass } from "@/lib/ui-classes";

const IDLE_MS = 8 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "keydown", "mousedown", "touchstart", "scroll"] as const;

export function IdleReminder() {
  const [idle, setIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function resetTimer() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setIdle(true), IDLE_MS);
    }

    function handleActivity() {
      // Once the reminder is showing, activity elsewhere on the page
      // shouldn't silently dismiss it — only the button below does, so a
      // stray mouse twitch can't hide the prompt without an actual answer.
      if (idle) return;
      resetTimer();
    }

    if (!idle) resetTimer();
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, handleActivity);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, handleActivity);
    };
  }, [idle]);

  if (!idle) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-w-sm flex-col gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-6 text-center shadow-lg">
        <p className="text-lg font-semibold text-[var(--color-text)]">Czy nadal tu jesteś?</p>
        <p className="text-sm text-[var(--color-text-muted)]">
          Nie widzimy żadnej aktywności od kilku minut.
        </p>
        <button type="button" onClick={() => setIdle(false)} className={buttonPrimaryClass}>
          Tak, pracuję dalej
        </button>
      </div>
    </div>
  );
}
