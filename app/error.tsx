"use client";

import { useEffect } from "react";
import {
  buttonPrimaryClass,
  headingClass,
  mutedTextClass,
  pageWrapClass,
} from "@/lib/ui-classes";

// Root error boundary — Next.js renders this in place of any page/layout
// segment under app/ that throws during render (a failed data fetch, a
// bug in a Server/Client Component, etc). Without this, that showed
// Next.js's default unstyled overlay instead of anything a non-technical
// employee could make sense of. Doesn't cover app/layout.tsx itself
// throwing — see global-error.tsx for that.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
        <h1 className={headingClass}>Coś poszło nie tak</h1>
        <p className={`text-sm ${mutedTextClass}`}>
          Wystąpił nieoczekiwany błąd. Spróbuj ponownie — jeśli się powtarza,
          zgłoś to administratorowi.
        </p>
        <button type="button" onClick={() => reset()} className={buttonPrimaryClass}>
          Spróbuj ponownie
        </button>
      </div>
    </div>
  );
}
