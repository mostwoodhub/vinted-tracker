import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getCurrentEmployee, getEffectiveRoles, isIntakeOnly } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { ThemeToggle } from "@/app/ThemeToggle";
import { NavMenu, type NavGroup } from "@/app/NavMenu";

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
`;

// Grouped into dropdowns to keep the header from sprawling into a wall of
// links — order and grouping requested directly by the admin user.
function getNavGroups(roles: Set<string>): NavGroup[] {
  if (roles.size === 0) return [];

  const isAdmin = roles.has("admin");
  const groups: NavGroup[] = [];

  // Pure intake employees only add stock — they don't need the full
  // warehouse browser (prices, every item, pending queue), just this.
  if (isIntakeOnly(roles)) {
    groups.push({ type: "link", href: "/intake", label: "Przyjęcie" });
    return groups;
  }

  if (isAdmin) {
    groups.push({ type: "link", href: "/sales", label: "Sprzedaż" });
    groups.push({
      type: "dropdown",
      label: "Statystyki",
      links: [
        { href: "/statistics", label: "Statystyki" },
        { href: "/charts", label: "Wykresy" },
      ],
    });
    groups.push({ type: "link", href: "/expenses", label: "Wydatki" });
    groups.push({
      type: "dropdown",
      label: "Partie",
      links: [
        { href: "/batches-archive", label: "Partie" },
        { href: "/accounts", label: "Konta" },
        { href: "/admin/employees", label: "Pracownicy" },
        { href: "/admin/login-log", label: "Historia logowań" },
        { href: "/admin/trash", label: "Kosz" },
        { href: "/admin/olx", label: "OLX" },
        { href: "/admin/allegro", label: "Allegro" },
        { href: "/admin/backup", label: "Kopia zapasowa" },
        { href: "/admin/photo-crop", label: "Przytnij zdjęcia" },
      ],
    });
    groups.push({ type: "link", href: "/dashboard", label: "Dashboard" });
  }

  const magazynLinks = [
    { href: "/warehouse", label: "Magazyn" },
    { href: "/pending", label: "Oczekujące" },
  ];
  if (isAdmin || roles.has("intake")) {
    magazynLinks.push({ href: "/intake", label: "Przyjęcie" });
  }
  if (isAdmin || roles.has("photographer")) {
    magazynLinks.push({ href: "/photo-queue", label: "Do zdjęć" });
  }
  if (isAdmin || roles.has("publisher")) {
    magazynLinks.push({ href: "/drafts", label: "Szkice AI" });
  }
  groups.push({ type: "dropdown", label: "Magazyn", links: magazynLinks });

  return groups;
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vinted Tracker",
  description:
    "Magazyn, sprzedaż i ogłoszenia (Vinted, Allegro, OLX) w jednym miejscu.",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  // Makes "Add to Home Screen" on iOS Safari open in standalone (app-like)
  // mode instead of inside Safari's browser chrome — this is what the user
  // was missing when they added the site to their home screen.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Vinted Tracker",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);
  const navGroups = getNavGroups(roles);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
        {employee && (
          <header className="bg-[var(--color-surface)]">
            <nav className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-6 py-3 text-sm">
              <NavMenu groups={navGroups} />
              <div className="ml-auto flex items-center gap-3">
                <ThemeToggle />
                <span className="text-xs text-[var(--color-text-muted)]">
                  {employee.full_name}
                </span>
                <form action={logout}>
                  <button
                    type="submit"
                    className="text-xs font-medium text-[var(--color-text-muted)] underline-offset-2 transition-colors hover:text-[var(--color-text)] hover:underline"
                  >
                    Wyloguj
                  </button>
                </form>
              </div>
            </nav>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
