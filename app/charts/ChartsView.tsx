"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PeriodFilterControl } from "@/app/PeriodFilterControl";
import { defaultPeriodFilter, matchesPeriod, type PeriodFilterState } from "@/lib/period-filter";
import { formatPln } from "@/lib/format";
import { computeSalesStatistics, buildDailySeries, type Breakdown } from "@/lib/sales-stats";
import type { SaleRow } from "@/lib/sales-types";
import { cardClass, headingClass, mutedTextClass, pageWrapClass } from "@/lib/ui-classes";

export type ExpenseRow = {
  expense_date: string | null;
  category: string | null;
  amount: number | null;
};

export type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
};

const tooltipContentStyle: React.CSSProperties = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--color-text)",
  fontSize: "0.875rem",
};

const tickStyle = { fill: "var(--color-text-muted)", fontSize: 12 };

function Tile({
  label,
  value,
  valueClass,
  highlighted,
}: {
  label: string;
  value: string;
  valueClass?: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`${cardClass} ${
        highlighted ? "border-2 border-[var(--color-accent)]" : ""
      }`}
    >
      <p className={`text-xs ${mutedTextClass}`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueClass ?? "text-[var(--color-text)]"}`}>
        {value}
      </p>
    </div>
  );
}

function DailyAreaChart({
  title,
  data,
  dataKey,
  formatter,
}: {
  title: string;
  data: { date: string; value: number }[];
  dataKey: string;
  formatter: (value: number) => string;
}) {
  return (
    <div className={cardClass}>
      <h2 className="mb-4 text-lg font-semibold text-[var(--color-text)]">{title}</h2>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={tickStyle}
            axisLine={{ stroke: "var(--color-border)" }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis tick={tickStyle} axisLine={false} tickLine={false} width={70} />
          <Tooltip
            contentStyle={tooltipContentStyle}
            formatter={(value) => formatter(typeof value === "number" ? value : Number(value))}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-accent)"
            strokeWidth={2}
            fill={`url(#fill-${dataKey})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProfitBarList({ title, rows }: { title: string; rows: Breakdown[] }) {
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.totalProfit)));

  return (
    <div className="flex flex-col gap-[var(--gap-default)]">
      <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
      <div className={`flex flex-col gap-3 ${cardClass}`}>
        {rows.map((row) => {
          const positive = row.totalProfit >= 0;
          const widthPct = Math.max(2, (Math.abs(row.totalProfit) / maxAbs) * 100);
          return (
            <div key={row.key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-[var(--color-text)]">{row.key}</span>
                <span
                  className={`font-semibold ${
                    positive ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"
                  }`}
                >
                  {formatPln(row.totalProfit)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg)]">
                <div
                  className={`h-full rounded-full ${
                    positive ? "bg-[var(--color-success)]" : "bg-[var(--color-danger)]"
                  }`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className={`text-sm ${mutedTextClass}`}>Brak danych.</p>
        )}
      </div>
    </div>
  );
}

export function ChartsView({
  sales,
  expenses,
  profiles,
}: {
  sales: SaleRow[];
  expenses: ExpenseRow[];
  profiles: ProfileRow[];
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
    () => computeSalesStatistics(filtered, filteredExpenses, profiles),
    [filtered, filteredExpenses, profiles]
  );

  const daily = useMemo(() => buildDailySeries(filtered), [filtered]);
  const revenueSeries = useMemo(
    () => daily.map((d) => ({ date: d.date, value: Math.round(d.revenue * 100) / 100 })),
    [daily]
  );
  const profitSeries = useMemo(
    () => daily.map((d) => ({ date: d.date, value: Math.round(d.profit * 100) / 100 })),
    [daily]
  );
  const quantitySeries = useMemo(
    () => daily.map((d) => ({ date: d.date, value: d.quantity })),
    [daily]
  );

  const avgPricePerPair = stats.totalQuantity > 0 ? stats.totalRevenue / stats.totalQuantity : 0;

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-[var(--space-xl)] px-6 py-12">
        <h1 className={headingClass}>Wykresy</h1>

        <PeriodFilterControl value={period} onChange={setPeriod} />

        {filtered.length === 0 ? (
          <div className={`text-center text-sm ${mutedTextClass} ${cardClass}`}>
            Brak danych do wyświetlenia w tym okresie.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-[var(--space-md)] sm:grid-cols-3">
              <Tile label="Przychód" value={formatPln(stats.totalRevenue)} />
              <Tile label="Sprzedanych par" value={String(stats.totalQuantity)} />
              <Tile label="Śr. cena za parę" value={formatPln(avgPricePerPair)} />
              <Tile
                label="Wydatki"
                value={`-${formatPln(stats.totalExpensesAmount)}`}
                valueClass="text-[var(--color-danger)]"
              />
              <Tile
                label="Finalny zysk netto za okres"
                value={formatPln(stats.finalNetProfit)}
                valueClass={
                  stats.finalNetProfit >= 0
                    ? "text-[var(--color-success)]"
                    : "text-[var(--color-danger)]"
                }
                highlighted
              />
            </div>

            <DailyAreaChart
              title="Przychód dziennie"
              data={revenueSeries}
              dataKey="revenue"
              formatter={formatPln}
            />
            <DailyAreaChart
              title="Zysk netto dziennie"
              data={profitSeries}
              dataKey="profit"
              formatter={formatPln}
            />
            <DailyAreaChart
              title="Liczba sprzedanych par dziennie"
              data={quantitySeries}
              dataKey="quantity"
              formatter={(v) => String(v)}
            />

            <ProfitBarList title="Zysk netto wg platformy" rows={stats.byPlatform} />
            <ProfitBarList title="Zysk netto wg kraju" rows={stats.byCountry} />
          </>
        )}
      </div>
    </div>
  );
}
