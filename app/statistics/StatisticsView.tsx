"use client";

import { useMemo, useState } from "react";
import { PeriodFilterControl } from "@/app/PeriodFilterControl";
import { SalesActionBar } from "@/app/SalesActionBar";
import { defaultPeriodFilter, matchesPeriod, type PeriodFilterState } from "@/lib/period-filter";
import { formatPln } from "@/lib/format";
import { INCOME_TAX_RATE } from "@/lib/sales-calc";
import { computeSalesStatistics, type Breakdown, type MatchableItem } from "@/lib/sales-stats";
import { EXPENSE_CATEGORY_ROWS } from "@/lib/expense-categories";
import type { SaleRow } from "@/lib/sales-types";
import { cardClass, headingClass, mutedTextClass, pageWrapClass } from "@/lib/ui-classes";

export type ExpenseRow = {
  expense_date: string | null;
  category: string | null;
  amount: number | null;
  batch_name: string | null;
};

export type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
};

function Tile({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className={cardClass}>
      <p className={`text-xs ${mutedTextClass}`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueClass ?? "text-[var(--color-text)]"}`}>
        {value}
      </p>
    </div>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: Breakdown[] }) {
  return (
    <div className="flex flex-col gap-[var(--gap-default)]">
      <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
      <div className={`overflow-x-auto ${cardClass} !p-0`}>
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className={`text-xs ${mutedTextClass}`}>
            <tr>
              <th className="px-4 py-3 font-medium">Nazwa</th>
              <th className="px-4 py-3 font-medium">Liczba sprzedaży</th>
              <th className="px-4 py-3 font-medium">Przychód</th>
              <th className="px-4 py-3 font-medium">Zysk netto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className="[&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--color-bg)]"
              >
                <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                  {row.key}
                </td>
                <td className="px-4 py-3 text-[var(--color-text)]">{row.count}</td>
                <td className="px-4 py-3 text-[var(--color-text)]">
                  {formatPln(row.totalRevenue)}
                </td>
                <td
                  className={`px-4 py-3 font-medium ${
                    row.totalProfit >= 0
                      ? "text-[var(--color-success)]"
                      : "text-[var(--color-danger)]"
                  }`}
                >
                  {formatPln(row.totalProfit)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className={`px-4 py-6 text-center text-sm ${mutedTextClass}`}>
                  Brak danych.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StatisticsView({
  sales,
  expenses,
  profiles,
  items = [],
}: {
  sales: SaleRow[];
  expenses: ExpenseRow[];
  profiles: ProfileRow[];
  items?: MatchableItem[];
}) {
  const [period, setPeriod] = useState<PeriodFilterState>(defaultPeriodFilter());

  const filtered = useMemo(
    () => sales.filter((sale) => matchesPeriod(sale.sale_date, period)),
    [sales, period]
  );

  const filteredExpenses = useMemo(
    () => expenses.filter((expense) => matchesPeriod(expense.expense_date, period)),
    [expenses, period]
  );

  const stats = useMemo(
    () => computeSalesStatistics(filtered, filteredExpenses, profiles, items),
    [filtered, filteredExpenses, profiles, items]
  );

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-[var(--space-xl)] px-6 py-12">
        <h1 className={headingClass}>Statystyki</h1>

        <div className="no-print">
          <PeriodFilterControl value={period} onChange={setPeriod} />
        </div>

        <SalesActionBar
          sales={filtered}
          allSales={sales}
          expenses={filteredExpenses}
          allBatchExpenses={expenses}
          profiles={profiles}
          period={period}
        />

        <div className="grid grid-cols-2 gap-[var(--space-md)] sm:grid-cols-4">
          <Tile label="Liczba sprzedaży" value={String(stats.count)} />
          <Tile label="Przychód" value={formatPln(stats.totalRevenue)} />
          <Tile
            label="Zysk ze sprzedaży (przed wydatkami)"
            value={formatPln(stats.salesProfit)}
            valueClass={
              stats.salesProfit >= 0
                ? "text-[var(--color-success)]"
                : "text-[var(--color-danger)]"
            }
          />
          <Tile label="Średnia marża" value={`${stats.averageMargin.toFixed(1)}%`} />
        </div>

        <div className="grid grid-cols-2 gap-[var(--space-md)] sm:grid-cols-4">
          <Tile
            label="Koszt własny"
            value={`-${formatPln(stats.totalCostOwn)}`}
            valueClass="text-[var(--color-warning)]"
          />
          <Tile
            label="Prowizje"
            value={`-${formatPln(stats.totalFees)}`}
            valueClass="text-[var(--color-danger)]"
          />
          <Tile
            label="VAT"
            value={`-${formatPln(stats.totalVat)}`}
            valueClass="text-[var(--color-danger)]"
          />
          <Tile
            label={`Podatek dochodowy ${INCOME_TAX_RATE * 100}%`}
            value={`-${formatPln(stats.totalIncomeTax)}`}
            valueClass="text-[var(--color-danger)]"
          />
        </div>

        <div className="flex flex-col gap-[var(--gap-default)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            Wydatki (wszystkie kategorie)
          </h2>
          <div className={`overflow-x-auto ${cardClass} !p-0`}>
            <table className="w-full min-w-[360px] text-left text-sm">
              <tbody>
                {EXPENSE_CATEGORY_ROWS.map((row) => (
                  <tr
                    key={row.key}
                    className="[&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--color-bg)]"
                  >
                    <td className="px-4 py-3 text-[var(--color-text)]">
                      {row.emoji} {row.label}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--color-text)]">
                      {formatPln(stats.expenseCategories[row.key])}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-3 font-semibold text-[var(--color-text)]">
                    Razem wydatki
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-[var(--color-text)]">
                    {formatPln(stats.totalExpensesAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className={cardClass}>
          <p className={`text-xs ${mutedTextClass}`}>
            Finalny zysk netto (po wydatkach)
          </p>
          <p
            className={`mt-1 text-3xl font-bold ${
              stats.finalNetProfit >= 0
                ? "text-[var(--color-success)]"
                : "text-[var(--color-danger)]"
            }`}
          >
            {formatPln(stats.finalNetProfit)}
          </p>
          <p className={`mt-1 text-xs ${mutedTextClass}`}>
            {formatPln(stats.salesProfit)} zysku ze sprzedaży − {formatPln(stats.totalExpensesAmount)} wydatków
          </p>
        </div>

        <div className="flex flex-col gap-[var(--gap-default)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            Przepływ gotówki w tym okresie
          </h2>
          <div className="grid grid-cols-1 gap-[var(--space-md)] sm:grid-cols-3">
            <Tile
              label="Wpłynęło (sprzedaż)"
              value={formatPln(stats.cashIn)}
              valueClass="text-[var(--color-success)]"
            />
            <Tile
              label="Wypłynęło (wydatki)"
              value={`-${formatPln(stats.cashOut)}`}
              valueClass="text-[var(--color-danger)]"
            />
            <Tile
              label="Saldo gotówkowe"
              value={formatPln(stats.cashBalance)}
              valueClass={
                stats.cashBalance >= 0
                  ? "text-[var(--color-success)]"
                  : "text-[var(--color-danger)]"
              }
            />
          </div>
        </div>

        <BreakdownTable title="Wg platformy" rows={stats.byPlatform} />
        <BreakdownTable title="Wg konta" rows={stats.byAccount} />
        <BreakdownTable title="Wg kraju" rows={stats.byCountry} />
        <BreakdownTable title="Wg pracownika (tylko ty widzisz)" rows={stats.byEmployee} />

        <div className="flex flex-col gap-1">
          <p className={`text-xs ${mutedTextClass}`}>
            Poniższe trzy rozbicia (marka / rozmiar / partia) łączą sprzedaż z
            towarem po starym numerze — sprzedaże bez dopasowania trafiają do
            wiersza „—”.
          </p>
        </div>
        <BreakdownTable title="Wg marki" rows={stats.byBrand} />
        <BreakdownTable title="Wg rozmiaru" rows={stats.bySize} />
        <BreakdownTable title="Wg partii" rows={stats.byBatch} />
      </div>
    </div>
  );
}
