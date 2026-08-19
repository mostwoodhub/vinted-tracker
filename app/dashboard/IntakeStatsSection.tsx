"use client";

import { useMemo, useState } from "react";
import { IntakeFrequencyChart, type IntakeEvent } from "./IntakeFrequencyChart";
import { cardClass, mutedTextClass, pillClass } from "@/lib/ui-classes";
import {
  addDaysIso,
  addMonthsIso,
  daysBetweenIso,
  daysInMonthIso,
  formatDayMonthPl,
  warsawDateString,
  warsawHour,
  warsawMinute,
  weekStartIso,
  weekdayAbbrevPl,
} from "@/lib/warsaw-time";

type Mode = "day" | "week" | "month";

const MONTHS_GENITIVE_PL = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];
const MONTHS_NOMINATIVE_PL = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatLongDatePl(dateIso: string) {
  const [y, m, d] = dateIso.split("-").map(Number);
  return `${d} ${MONTHS_GENITIVE_PL[m - 1]} ${y}`;
}

export type IntakeItem = { employeeId: string; createdAt: string };

export function IntakeStatsSection({
  items,
  displayNames,
  todayWarsaw,
  heading = "Towary przyjęte wg pracownika",
  caveatText = "Starsze towary (sprzed 16.08.2026) nie mają zapisanego, kto je przyjął.",
  emptyStateText = "Nikt nie przyjął towaru w tym okresie.",
  chartTitle = "Chronologia przyjmowania towarów",
  chartSubtitle = "Każda kropka to jeden dodany towar, z dokładnym czasem.",
}: {
  items: IntakeItem[];
  displayNames: Record<string, string>;
  todayWarsaw: string;
  heading?: string;
  caveatText?: string;
  emptyStateText?: string;
  chartTitle?: string;
  chartSubtitle?: string;
}) {
  const [mode, setMode] = useState<Mode>("day");
  const [dayCursor, setDayCursor] = useState(todayWarsaw);
  const [monthCursor, setMonthCursor] = useState(todayWarsaw.slice(0, 7));

  function resetToToday() {
    setDayCursor(todayWarsaw);
    setMonthCursor(todayWarsaw.slice(0, 7));
  }

  function stepBack() {
    if (mode === "day") setDayCursor((d) => addDaysIso(d, -1));
    else if (mode === "week") setDayCursor((d) => addDaysIso(d, -7));
    else setMonthCursor((m) => addMonthsIso(m, -1));
  }

  function stepForward() {
    if (mode === "day") setDayCursor((d) => addDaysIso(d, 1));
    else if (mode === "week") setDayCursor((d) => addDaysIso(d, 7));
    else setMonthCursor((m) => addMonthsIso(m, 1));
  }

  const periodKey = mode === "day" ? dayCursor : mode === "week" ? weekStartIso(dayCursor) : monthCursor;

  const periodLabel = useMemo(() => {
    if (mode === "day") return formatLongDatePl(dayCursor);
    if (mode === "week") {
      const start = weekStartIso(dayCursor);
      const end = addDaysIso(start, 6);
      return `${formatDayMonthPl(start)} – ${formatLongDatePl(end)}`;
    }
    const [y, m] = monthCursor.split("-").map(Number);
    return `${MONTHS_NOMINATIVE_PL[m - 1]} ${y}`;
  }, [mode, dayCursor, monthCursor]);

  const { rows, events, domain, ticks, tickFormatter } = useMemo(() => {
    const countsByName = new Map<string, number>();
    const points: IntakeEvent[] = [];

    for (const item of items) {
      const date = new Date(item.createdAt);
      const wd = warsawDateString(date);
      let matches: boolean;
      if (mode === "day") matches = wd === periodKey;
      else if (mode === "week") matches = weekStartIso(wd) === periodKey;
      else matches = wd.slice(0, 7) === periodKey;
      if (!matches) continue;

      const name = displayNames[item.employeeId] ?? "Nieznany";
      countsByName.set(name, (countsByName.get(name) ?? 0) + 1);

      const hour = warsawHour(date);
      const minute = warsawMinute(date);
      const time = `${pad(hour)}:${pad(minute)}`;

      if (mode === "day") {
        points.push({ employee: name, x: hour * 60 + minute, label: time });
      } else if (mode === "week") {
        const dayIndex = daysBetweenIso(periodKey, wd);
        points.push({
          employee: name,
          x: dayIndex * 1440 + hour * 60 + minute,
          label: `${weekdayAbbrevPl(wd)} ${formatDayMonthPl(wd)}, ${time}`,
        });
      } else {
        const dayIndex = daysBetweenIso(`${periodKey}-01`, wd);
        points.push({
          employee: name,
          x: dayIndex * 1440 + hour * 60 + minute,
          label: `${formatDayMonthPl(wd)}, ${time}`,
        });
      }
    }

    const rows = Array.from(countsByName.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    let domain: [number, number];
    let ticks: number[];
    let tickFormatter: (x: number) => string;

    if (mode === "day") {
      const xs = points.map((p) => p.x);
      // Default 07:00–14:00 — the usual work window, zoomed in enough that
      // gaps between intake events actually read as gaps. Still expands to
      // fit any real data that falls outside it.
      const start = Math.min(7 * 60, ...xs);
      const end = Math.max(14 * 60, ...xs);
      domain = [start, end];
      ticks = [];
      for (let m = Math.ceil(start / 60) * 60; m <= end; m += 60) ticks.push(m);
      tickFormatter = (x) => `${pad(Math.floor(x / 60))}:00`;
    } else if (mode === "week") {
      domain = [0, 7 * 1440];
      ticks = Array.from({ length: 7 }, (_, i) => i * 1440);
      tickFormatter = (x) => {
        const dateIso = addDaysIso(periodKey, Math.round(x / 1440));
        return `${weekdayAbbrevPl(dateIso)} ${formatDayMonthPl(dateIso)}`;
      };
    } else {
      const totalDays = daysInMonthIso(periodKey);
      domain = [0, totalDays * 1440];
      const step = totalDays > 24 ? 6 : 5;
      const dayIndices: number[] = [];
      for (let d = 0; d < totalDays; d += step) dayIndices.push(d);
      if (dayIndices[dayIndices.length - 1] !== totalDays - 1) dayIndices.push(totalDays - 1);
      ticks = dayIndices.map((d) => d * 1440);
      tickFormatter = (x) => formatDayMonthPl(addDaysIso(`${periodKey}-01`, Math.round(x / 1440)));
    }

    return { rows, events: points, domain, ticks, tickFormatter };
  }, [items, displayNames, mode, periodKey]);

  const activeNames = rows.map((r) => r.name);
  const isToday = mode === "day" && dayCursor === todayWarsaw;

  return (
    <div className="flex flex-col gap-[var(--gap-default)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          {heading}
        </h2>
        <div className="flex items-center gap-2">
          <button type="button" className={pillClass(mode === "day")} onClick={() => setMode("day")}>
            Dzień
          </button>
          <button type="button" className={pillClass(mode === "week")} onClick={() => setMode("week")}>
            Tydzień
          </button>
          <button type="button" className={pillClass(mode === "month")} onClick={() => setMode("month")}>
            Miesiąc
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={stepBack}
            aria-label="Poprzedni okres"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-text)] transition-opacity hover:opacity-80"
          >
            ‹
          </button>
          <p className="min-w-[10rem] text-center text-sm font-medium text-[var(--color-text)]">
            {periodLabel}
          </p>
          <button
            type="button"
            onClick={stepForward}
            aria-label="Następny okres"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-text)] transition-opacity hover:opacity-80"
          >
            ›
          </button>
        </div>
        {!isToday && (
          <button
            type="button"
            onClick={resetToToday}
            className="rounded-full bg-[var(--color-surface-2)] px-3 py-1 text-xs font-medium text-[var(--color-text)] transition-opacity hover:opacity-80"
          >
            Dziś
          </button>
        )}
      </div>

      <p className={`text-xs ${mutedTextClass}`}>{caveatText}</p>

      <div className={`overflow-x-auto ${cardClass} !p-0`}>
        <table className="w-full min-w-[320px] text-left text-sm">
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.name}
                className="[&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--color-bg)]"
              >
                <td className="px-4 py-3 text-[var(--color-text)]">{row.name}</td>
                <td className="px-4 py-3 text-right font-semibold text-[var(--color-text)]">
                  {row.count}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className={`px-4 py-6 text-center text-sm ${mutedTextClass}`}>
                  {emptyStateText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <IntakeFrequencyChart
        title={chartTitle}
        subtitle={chartSubtitle}
        events={events}
        employeeNames={activeNames}
        domain={domain}
        ticks={ticks}
        tickFormatter={tickFormatter}
      />
    </div>
  );
}
