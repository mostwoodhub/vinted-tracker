"use client";

import { useMemo, useState } from "react";
import { PeriodFilterControl } from "@/app/PeriodFilterControl";
import { defaultPeriodFilter, matchesPeriod, type PeriodFilterState } from "@/lib/period-filter";
import { formatPln } from "@/lib/format";
import { cardClass, headingClass, mutedTextClass, pageWrapClass } from "@/lib/ui-classes";

export type ExpenseRow = {
  id: string;
  expense_date: string | null;
  category: string | null;
  description: string | null;
  amount: number | null;
  batch_name: string | null;
};

export function ExpensesView({ expenses }: { expenses: ExpenseRow[] }) {
  const [period, setPeriod] = useState<PeriodFilterState>(defaultPeriodFilter());

  const filtered = useMemo(
    () => expenses.filter((expense) => matchesPeriod(expense.expense_date, period)),
    [expenses, period]
  );

  const total = useMemo(
    () => filtered.reduce((sum, expense) => sum + (expense.amount ?? 0), 0),
    [filtered]
  );

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-[var(--space-lg)] px-6 py-12">
        <h1 className={headingClass}>Wydatki</h1>

        <PeriodFilterControl value={period} onChange={setPeriod} />

        <p className={`text-sm ${mutedTextClass}`}>
          {filtered.length} {filtered.length === 1 ? "wydatek" : "wydatków"} · razem{" "}
          <span className="font-medium text-[var(--color-danger)]">
            {formatPln(total)}
          </span>
        </p>

        <div className="flex flex-col gap-[var(--gap-default)]">
          {filtered.map((expense) => (
            <div
              key={expense.id}
              className={`flex items-center gap-[var(--space-md)] ${cardClass}`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[var(--color-text)]">
                    {expense.description || "—"}
                  </span>
                  {expense.category && (
                    <span className="rounded-full bg-[var(--color-warning-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-warning)]">
                      {expense.category}
                    </span>
                  )}
                </div>
                <p className={`truncate text-sm ${mutedTextClass}`}>
                  {expense.expense_date ?? "—"}
                  {expense.batch_name ? ` · partia ${expense.batch_name}` : ""}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-xl font-bold text-[var(--color-danger)]">
                  {formatPln(expense.amount)}
                </p>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className={`text-center text-sm ${mutedTextClass} ${cardClass}`}>
              Brak wydatków spełniających kryteria.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
