"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cardClass, mutedTextClass } from "@/lib/ui-classes";

// Validated categorical palette (see dataviz skill) — fixed hue order, never
// cycled or reassigned per-render, so a given employee always keeps the same
// color across reloads. Capped at 6 series; a 7th employee active in one day
// would need a re-validated palette rather than an ad-hoc extra hue.
const SERIES_COLORS = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
];

const tooltipContentStyle: React.CSSProperties = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--color-text)",
  fontSize: "0.875rem",
};

const tickStyle = { fill: "var(--color-text-muted)", fontSize: 12 };

export type HourlyIntakeRow = { hour: string } & Record<string, number | string>;

export function IntakeFrequencyChart({
  data,
  employeeNames,
}: {
  data: HourlyIntakeRow[];
  employeeNames: string[];
}) {
  if (employeeNames.length === 0) return null;

  return (
    <div className={cardClass}>
      <h2 className="mb-1 text-lg font-semibold text-[var(--color-text)]">
        Częstotliwość przyjmowania towarów (dziś, wg godziny)
      </h2>
      <p className={`mb-4 text-xs ${mutedTextClass}`}>
        Ile towarów każdy pracownik dodał w danej godzinie — widać tempo i przerwy.
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} barGap={2} barCategoryGap="20%">
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="hour"
            tick={tickStyle}
            axisLine={{ stroke: "var(--color-border)" }}
            tickLine={false}
            interval={2}
          />
          <YAxis
            tick={tickStyle}
            axisLine={false}
            tickLine={false}
            width={30}
            allowDecimals={false}
          />
          <Tooltip contentStyle={tooltipContentStyle} cursor={{ fill: "var(--color-surface-2)" }} />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--color-text-muted)" }} />
          {employeeNames.map((name, i) => (
            <Bar
              key={name}
              dataKey={name}
              stackId="intake"
              fill={SERIES_COLORS[i % SERIES_COLORS.length]}
              radius={i === employeeNames.length - 1 ? [4, 4, 0, 0] : undefined}
              maxBarSize={24}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
