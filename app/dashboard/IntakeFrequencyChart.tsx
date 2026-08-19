"use client";

import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { cardClass, mutedTextClass } from "@/lib/ui-classes";

// Validated categorical palette slot 1 (blue, see dataviz skill) — a single
// hue is correct here since each employee already gets their own row; color
// on the dot is just a legibility aid, not the identity channel.
const DOT_COLOR = "#2a78d6";

const tooltipContentStyle: React.CSSProperties = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--color-text)",
  fontSize: "0.875rem",
};

const tickStyle = { fill: "var(--color-text-muted)", fontSize: 12 };

const ROW_HEIGHT = 48;
const MIN_HEIGHT = 160;

export type IntakeEvent = { employee: string; x: number; label: string };

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: IntakeEvent }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div style={tooltipContentStyle} className="px-3 py-2">
      <p className="font-semibold">{point.label}</p>
      <p className={mutedTextClass}>{point.employee}</p>
    </div>
  );
}

export function IntakeFrequencyChart({
  title,
  subtitle,
  events,
  employeeNames,
  domain,
  ticks,
  tickFormatter,
}: {
  title: string;
  subtitle: string;
  events: IntakeEvent[];
  employeeNames: string[];
  domain: [number, number];
  ticks: number[];
  tickFormatter: (x: number) => string;
}) {
  return (
    <div className={cardClass}>
      <h2 className="mb-1 text-lg font-semibold text-[var(--color-text)]">{title}</h2>
      <p className={`mb-4 text-xs ${mutedTextClass}`}>{subtitle}</p>
      {employeeNames.length === 0 ? (
        <div
          className={`flex items-center justify-center text-sm ${mutedTextClass}`}
          style={{ height: MIN_HEIGHT }}
        >
          Brak danych w wybranym okresie.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(MIN_HEIGHT, employeeNames.length * ROW_HEIGHT + 60)}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="var(--color-border)" horizontal={false} />
            <XAxis
              type="number"
              dataKey="x"
              domain={domain}
              ticks={ticks}
              tickFormatter={tickFormatter}
              tick={tickStyle}
              axisLine={{ stroke: "var(--color-border)" }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="employee"
              domain={employeeNames}
              allowDuplicatedCategory={false}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              width={100}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--color-border)", strokeDasharray: "3 3" }} />
            <Scatter
              data={events}
              shape={(props: { cx?: number; cy?: number }) => (
                <circle cx={props.cx} cy={props.cy} r={5} fill={DOT_COLOR} fillOpacity={0.85} />
              )}
            />
          </ScatterChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
