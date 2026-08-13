export function formatPln(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(2)} zł`;
}

export function formatMonthLabel(monthIso: string): string {
  const [year, month] = monthIso.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
}
