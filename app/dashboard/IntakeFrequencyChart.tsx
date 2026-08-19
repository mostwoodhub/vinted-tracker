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
const BASE_START_MIN = 6 * 60; // 06:00 — a sensible default window even with no events yet
const BASE_END_MIN = 22 * 60; // 22:00

export type IntakeEvent = { employee: string; minutes: number; time: string };

function minutesToLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  return `${String(h).padStart(2, "0")}:00`;
}

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
      <p className="font-semibold">{point.time}</p>
      <p className={mutedTextClass}>{point.employee}</p>
    </div>
  );
}

export function IntakeFrequencyChart({
  events,
  employeeNames,
}: {
  events: IntakeEvent[];
  employeeNames: string[];
}) {
  if (employeeNames.length === 0) return null;

  const eventMinutes = events.map((e) => e.minutes);
  const domainStart = Math.min(BASE_START_MIN, ...eventMinutes);
  const domainEnd = Math.max(BASE_END_MIN, ...eventMinutes);
  const ticks: number[] = [];
  for (let m = Math.ceil(domainStart / 60) * 60; m <= domainEnd; m += 60) {
    ticks.push(m);
  }

  return (
    <div className={cardClass}>
      <h2 className="mb-1 text-lg font-semibold text-[var(--color-text)]">
        Chronologia przyjmowania towarów (dziś)
      </h2>
      <p className={`mb-4 text-xs ${mutedTextClass}`}>
        Każda kropka to jeden dodany towar, w dokładnej godzinie i minucie.
      </p>
      <ResponsiveContainer width="100%" height={employeeNames.length * ROW_HEIGHT + 60}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="var(--color-border)" horizontal={false} />
          <XAxis
            type="number"
            dataKey="minutes"
            domain={[domainStart, domainEnd]}
            ticks={ticks}
            tickFormatter={minutesToLabel}
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
    </div>
  );
}
