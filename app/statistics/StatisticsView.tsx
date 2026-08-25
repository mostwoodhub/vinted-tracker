"use client";

import { useMemo, useState } from "react";
import { PeriodFilterControl } from "@/app/PeriodFilterControl";
import { SalesActionBar } from "@/app/SalesActionBar";
import { defaultPeriodFilter, matchesPeriod, type PeriodFilterState } from "@/lib/period-filter";
import { formatPln } from "@/lib/format";
import { INCOME_TAX_RATE } from "@/lib/sales-calc";
import {
  computeSalesStatistics,
  type Breakdown,
  type MatchableItem,
  type ProfitPerPairBucket,
} from "@/lib/sales-stats";
import { EXPENSE_CATEGORY_ROWS } from "@/lib/expense-categories";
import { bucketByDays, median, type DayBucket } from "@/lib/day-buckets";
import type { SaleRow } from "@/lib/sales-types";
import type { BatchPayback } from "@/lib/batch-stats";
import { cardClass, headingClass, mutedTextClass, pageWrapClass } from "@/lib/ui-classes";

export type ExpenseRow = {
  expense_date: string | null;
  category: string | null;
  amount: number | null;
  batch_name: string | null;
};

export type SoldTiming = { soldDate: string; daysToSell: number };
export type ReturnEvent = { date: string };

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

// The average margin tile hides the spread — one very profitable pair can
// mask several that sold at a loss. This shows how profit is actually
// distributed across individual pairs instead of just the one number.
function ProfitDistributionTable({ rows }: { rows: ProfitPerPairBucket[] }) {
  const totalCount = rows.reduce((sum, r) => sum + r.count, 0);
  const maxCount = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className="flex flex-col gap-[var(--gap-default)]">
      <h2 className="text-lg font-semibold text-[var(--color-text)]">
        Zysk na parę (rozkład)
      </h2>
      <div className={`overflow-x-auto ${cardClass} !p-0`}>
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className={`text-xs ${mutedTextClass}`}>
            <tr>
              <th className="px-4 py-3 font-medium">Przedział</th>
              <th className="px-4 py-3 font-medium">Liczba par</th>
              <th className="px-4 py-3 font-medium">Łączny zysk</th>
              <th className="px-4 py-3 font-medium">Średni zysk / parę</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className="[&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--color-bg)]"
              >
                <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                  {row.label}
                </td>
                <td className="px-4 py-3 text-[var(--color-text)]">
                  <div className="flex items-center gap-2">
                    <span className="w-6 shrink-0 text-right">{row.count}</span>
                    <div className="h-2 flex-1 rounded-full bg-[var(--color-bg)]">
                      <div
                        className={`h-2 rounded-full ${
                          row.min < 0 ? "bg-[var(--color-danger)]" : "bg-[var(--color-accent)]"
                        }`}
                        style={{ width: `${(row.count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
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
                <td className="px-4 py-3 text-[var(--color-text)]">
                  {row.count > 0 ? formatPln(row.totalProfit / row.count) : "—"}
                </td>
              </tr>
            ))}
            {totalCount === 0 && (
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

// Shared shape for "how many days did this sit before X" distributions —
// same 0-30/30-60/60-90/90+ bands whether it's time-to-sell or inventory
// age, so the two read the same way at a glance.
function DayBucketTable({ title, rows }: { title: string; rows: DayBucket[] }) {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const maxCount = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className="flex flex-col gap-[var(--gap-default)]">
      <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
      <div className={`overflow-x-auto ${cardClass} !p-0`}>
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className={`text-xs ${mutedTextClass}`}>
            <tr>
              <th className="px-4 py-3 font-medium">Przedział</th>
              <th className="px-4 py-3 font-medium">Liczba par</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className="[&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--color-bg)]"
              >
                <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                  {row.label}
                </td>
                <td className="px-4 py-3 text-[var(--color-text)]">
                  <div className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-right">{row.count}</span>
                    <div className="h-2 flex-1 rounded-full bg-[var(--color-bg)]">
                      <div
                        className={`h-2 rounded-full ${
                          row.min >= 90 ? "bg-[var(--color-danger)]" : "bg-[var(--color-accent)]"
                        }`}
                        style={{ width: `${(row.count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {total === 0 && (
              <tr>
                <td colSpan={2} className={`px-4 py-6 text-center text-sm ${mutedTextClass}`}>
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

function BatchPaybackTable({ rows }: { rows: BatchPayback[] }) {
  return (
    <div className="flex flex-col gap-[var(--gap-default)]">
      <h2 className="text-lg font-semibold text-[var(--color-text)]">
        Okupność partii (cały czas)
      </h2>
      <p className={`text-xs ${mutedTextClass}`}>
        Koszt partii vs. przychód netto ze wszystkich dopasowanych sprzedaży —
        niezależnie od wybranego okresu powyżej.
      </p>
      <div className={`overflow-x-auto ${cardClass} !p-0`}>
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className={`text-xs ${mutedTextClass}`}>
            <tr>
              <th className="px-4 py-3 font-medium">Partia</th>
              <th className="px-4 py-3 font-medium">Koszt</th>
              <th className="px-4 py-3 font-medium">Przychód netto</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className="[&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--color-bg)]"
              >
                <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                  {row.label}
                </td>
                <td className="px-4 py-3 text-[var(--color-warning)]">
                  {row.costMissing ? (
                    <span className="text-[var(--color-danger)]">⚠ Brak kosztu zakupu</span>
                  ) : (
                    formatPln(row.cost)
                  )}
                </td>
                <td className="px-4 py-3 text-[var(--color-text)]">
                  {formatPln(row.revenue)}
                </td>
                <td
                  className={`px-4 py-3 font-medium ${
                    row.breakEvenReached
                      ? "text-[var(--color-success)]"
                      : "text-[var(--color-danger)]"
                  }`}
                >
                  {row.breakEvenReached ? "+" : "-"}
                  {formatPln(row.remaining)}
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
  batchPayback = [],
  soldTimings = [],
  returnEvents = [],
}: {
  sales: SaleRow[];
  expenses: ExpenseRow[];
  profiles: ProfileRow[];
  items?: MatchableItem[];
  batchPayback?: BatchPayback[];
  soldTimings?: SoldTiming[];
  returnEvents?: ReturnEvent[];
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

  const filteredSoldTimings = useMemo(
    () => soldTimings.filter((t) => matchesPeriod(t.soldDate, period)),
    [soldTimings, period]
  );
  const daysToSellMedian = useMemo(
    () => median(filteredSoldTimings.map((t) => t.daysToSell)),
    [filteredSoldTimings]
  );
  const daysToSellBuckets = useMemo(
    () => bucketByDays(filteredSoldTimings.map((t) => t.daysToSell)),
    [filteredSoldTimings]
  );

  const filteredReturnCount = useMemo(
    () => returnEvents.filter((r) => matchesPeriod(r.date, period)).length,
    [returnEvents, period]
  );
  const returnRate = stats.count > 0 ? (filteredReturnCount / stats.count) * 100 : 0;

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

        <div className="flex flex-col gap-[var(--gap-default)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            Cena wyjściowa vs cena sprzedaży
          </h2>
          <p className={`text-xs ${mutedTextClass}`}>
            Tylko pojedyncze sprzedaże jednoznacznie dopasowane do towaru z
            ceną wyjściową — orientacyjne, nie wszystkie sprzedaże da się tak
            dopasować.
          </p>
          <div className="grid grid-cols-2 gap-[var(--space-md)] sm:grid-cols-4">
            <Tile label="Dopasowanych sprzedaży" value={String(stats.discountStats.matchedCount)} />
            <Tile
              label="Pełna cena"
              value={String(stats.discountStats.fullPriceCount)}
              valueClass="text-[var(--color-success)]"
            />
            <Tile
              label="Ze zniżką"
              value={String(stats.discountStats.discountedCount)}
              valueClass="text-[var(--color-warning)]"
            />
            <Tile
              label="Średnia zniżka"
              value={
                stats.discountStats.discountedCount > 0
                  ? `${stats.discountStats.averageDiscountPercent.toFixed(1)}% (${formatPln(
                      stats.discountStats.averageDiscountAmount
                    )})`
                  : "—"
              }
              valueClass="text-[var(--color-warning)]"
            />
          </div>
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

        <p className={`text-xs ${mutedTextClass}`}>
          Czas do sprzedaży i zwroty liczone tylko dla sprzedaży powiązanych z
          konkretnym towarem w Magazynie — starsze/archiwalne wpisy takiego
          powiązania nie mają, dane będą przybywać wraz z nowymi sprzedażami.
        </p>

        <div className="grid grid-cols-1 gap-[var(--space-md)] sm:grid-cols-2">
          <Tile
            label="Mediana czasu do sprzedaży"
            value={daysToSellMedian != null ? `${daysToSellMedian} dni` : "—"}
            valueClass={
              daysToSellMedian == null || daysToSellMedian <= 60
                ? "text-[var(--color-success)]"
                : "text-[var(--color-warning)]"
            }
          />
          <Tile
            label="Zwroty"
            value={`${filteredReturnCount} (${returnRate.toFixed(1)}%)`}
            valueClass={
              returnRate <= 5 ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"
            }
          />
        </div>

        <DayBucketTable title="Czas do sprzedaży (rozkład)" rows={daysToSellBuckets} />

        <ProfitDistributionTable rows={stats.profitPerPair} />

        <BatchPaybackTable rows={batchPayback} />

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
