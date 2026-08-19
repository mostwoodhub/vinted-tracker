// Calendar-day math for Warsaw local time, safe to import from both server
// and client components (Intl.DateTimeFormat works in both).
//
// "Today" by the calendar date in Warsaw, not the runtime's own clock —
// Vercel functions run in UTC, so for the first 1-2 hours of every Warsaw
// day a naive `new Date().toISOString().slice(0,10)` would still report
// yesterday's date. sv-SE reliably formats hour 0 as "00" rather than the
// "24" some locales produce for hour12:false at midnight.

export function warsawDateString(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(date);
}

export function warsawHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      hour12: false,
    }).format(date)
  );
}

export function warsawMinute(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Warsaw",
      minute: "2-digit",
    }).format(date)
  );
}

// All of the below operate purely on "YYYY-MM-DD" calendar strings (already
// resolved to Warsaw local via warsawDateString) — plain Gregorian date-part
// arithmetic, so it's DST-safe: no instant/offset math involved.

export function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonthsIso(monthIso: string, months: number): string {
  const [y, m] = monthIso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Monday of the week containing dateIso.
export function weekStartIso(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  return addDaysIso(dateIso, diff);
}

export function daysBetweenIso(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86400000);
}

export function daysInMonthIso(monthIso: string): number {
  const [y, m] = monthIso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const WEEKDAY_ABBREV_PL = ["Ndz", "Pon", "Wt", "Śr", "Czw", "Pt", "Sob"];

export function weekdayAbbrevPl(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  return WEEKDAY_ABBREV_PL[d.getUTCDay()];
}

export function formatDayMonthPl(dateIso: string): string {
  const [, m, d] = dateIso.split("-");
  return `${d}.${m}`;
}
