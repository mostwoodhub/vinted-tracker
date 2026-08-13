"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") ?? "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Przełącz motyw"
      className="text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
    >
      {theme === null ? "🌓" : theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
