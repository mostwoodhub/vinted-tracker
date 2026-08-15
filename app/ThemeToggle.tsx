"use client";

import { useEffect, useState } from "react";

const THEME_ORDER = ["light", "dark", "latte"] as const;
const THEME_ICON: Record<string, string> = {
  light: "🌙", // shown when light is active — icon signals what you'll switch TO
  dark: "☕",
  latte: "☀️",
};

export function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(null);

  useEffect(() => {
    // layout.tsx runs an inline script before hydration that sets
    // data-theme on <html> from localStorage/system preference. `document`
    // isn't available during SSR, so this must run after mount to read the
    // real value without causing a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(document.documentElement.getAttribute("data-theme") ?? "light");
  }, []);

  function toggle() {
    const current = theme ?? "light";
    const currentIndex = THEME_ORDER.indexOf(current as (typeof THEME_ORDER)[number]);
    const next = THEME_ORDER[(currentIndex + 1) % THEME_ORDER.length] ?? "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Przełącz motyw (jasny / ciemny / latte)"
      title={theme ? `Motyw: ${theme}` : undefined}
      className="text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
    >
      {theme === null ? "🌓" : (THEME_ICON[theme] ?? "🌓")}
    </button>
  );
}
