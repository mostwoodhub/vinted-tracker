export type PeriodFilterState =
  | { mode: "all" }
  | { mode: "day"; date: string }
  | { mode: "month"; month: string }
  | { mode: "range"; from: string; to: string };

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonthIso(): string {
  return new Date().toISOString().slice(0, 7);
}

export function defaultPeriodFilter(): PeriodFilterState {
  return { mode: "day", date: todayIso() };
}

export function formatPeriodLabel(filter: PeriodFilterState): string {
  switch (filter.mode) {
    case "all":
      return "Wszystko";
    case "day":
      return `Dzień: ${filter.date}`;
    case "month":
      return `Miesiąc: ${filter.month}`;
    case "range":
      return `Zakres: ${filter.from || "…"} – ${filter.to || "…"}`;
  }
}

export function matchesPeriod(
  dateStr: string | null | undefined,
  filter: PeriodFilterState
): boolean {
  if (filter.mode === "all") return true;
  if (!dateStr) return false;

  switch (filter.mode) {
    case "day":
      return dateStr === filter.date;
    case "month":
      return dateStr.slice(0, 7) === filter.month;
    case "range": {
      if (filter.from && dateStr < filter.from) return false;
      if (filter.to && dateStr > filter.to) return false;
      return true;
    }
  }
}
