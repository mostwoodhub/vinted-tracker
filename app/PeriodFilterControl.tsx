"use client";

import { todayIso, currentMonthIso, type PeriodFilterState } from "@/lib/period-filter";
import { inputClass, mutedTextClass, pillClass } from "@/lib/ui-classes";

const MODE_LABELS: Record<PeriodFilterState["mode"], string> = {
  day: "Dzień",
  month: "Miesiąc",
  range: "Zakres",
  all: "Wszystko",
};

const MODES: PeriodFilterState["mode"][] = ["day", "month", "range", "all"];

export function PeriodFilterControl({
  value,
  onChange,
}: {
  value: PeriodFilterState;
  onChange: (next: PeriodFilterState) => void;
}) {
  function setMode(mode: PeriodFilterState["mode"]) {
    if (mode === "day") onChange({ mode: "day", date: todayIso() });
    else if (mode === "month") onChange({ mode: "month", month: currentMonthIso() });
    else if (mode === "range") onChange({ mode: "range", from: "", to: "" });
    else onChange({ mode: "all" });
  }

  return (
    <div className="flex flex-wrap items-end gap-[var(--gap-default)]">
      <div className="flex flex-wrap gap-2">
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setMode(mode)}
            className={pillClass(value.mode === mode)}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      {value.mode === "day" && (
        <label className="flex flex-col gap-1.5">
          <span className={`text-xs ${mutedTextClass}`}>Data</span>
          <input
            type="date"
            value={value.date}
            onChange={(e) => onChange({ mode: "day", date: e.target.value })}
            className={inputClass}
          />
        </label>
      )}

      {value.mode === "month" && (
        <label className="flex flex-col gap-1.5">
          <span className={`text-xs ${mutedTextClass}`}>Miesiąc</span>
          <input
            type="month"
            value={value.month}
            onChange={(e) => onChange({ mode: "month", month: e.target.value })}
            className={inputClass}
          />
        </label>
      )}

      {value.mode === "range" && (
        <>
          <label className="flex flex-col gap-1.5">
            <span className={`text-xs ${mutedTextClass}`}>Od</span>
            <input
              type="date"
              value={value.from}
              onChange={(e) =>
                onChange({ mode: "range", from: e.target.value, to: value.to })
              }
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={`text-xs ${mutedTextClass}`}>Do</span>
            <input
              type="date"
              value={value.to}
              onChange={(e) =>
                onChange({ mode: "range", from: value.from, to: e.target.value })
              }
              className={inputClass}
            />
          </label>
        </>
      )}
    </div>
  );
}
