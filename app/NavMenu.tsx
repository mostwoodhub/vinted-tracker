"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type NavLink = { href: string; label: string };

export type NavGroup =
  | { type: "link"; href: string; label: string }
  | { type: "dropdown"; label: string; links: NavLink[] };

const linkClass =
  "font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]";

function NavDropdown({ label, links }: { label: string; links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 ${linkClass}`}
      >
        {label}
        <span className="text-[10px]">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 flex min-w-[190px] flex-col gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-lg">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function NavMenu({ groups }: { groups: NavGroup[] }) {
  return (
    <>
      {groups.map((group) =>
        group.type === "link" ? (
          <Link key={group.href} href={group.href} className={linkClass}>
            {group.label}
          </Link>
        ) : (
          <NavDropdown key={group.label} label={group.label} links={group.links} />
        )
      )}
    </>
  );
}
