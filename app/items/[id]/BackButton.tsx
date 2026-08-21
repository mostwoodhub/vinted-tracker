"use client";

import { useRouter } from "next/navigation";
import { mutedTextClass } from "@/lib/ui-classes";

// The item card is opened from several places (Magazyn, Oczekujące, Partie,
// linked from a sale, from a duplicate-number warning…), so a fixed "back to
// X" link would be wrong half the time — real browser-history back is the
// only thing that's always correct. This mainly matters on mobile: opened
// as a home-screen PWA there's no browser chrome back button at all, so
// without this the only way out was re-navigating to Magazyn from scratch.
export function BackButton() {
  const router = useRouter();

  function handleClick() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/warehouse");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`self-start text-sm ${mutedTextClass} hover:text-[var(--color-text)]`}
    >
      ← Wstecz
    </button>
  );
}
