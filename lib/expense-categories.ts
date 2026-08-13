export type ExpenseCategoryTotals = {
  obuwie: number;
  podatki: number;
  wyplaty: number;
  other: number;
};

export const EXPENSE_CATEGORY_ROWS: {
  key: keyof ExpenseCategoryTotals;
  label: string;
  emoji: string;
}[] = [
  { key: "obuwie", label: "Obuwie", emoji: "👟" },
  { key: "podatki", label: "Podatki", emoji: "🧾" },
  { key: "wyplaty", label: "Wypłaty", emoji: "💰" },
  { key: "other", label: "Dodatkowe wydatki", emoji: "📦" },
];

export function categorizeExpenses(
  expenses: { category: string | null; amount: number | null }[]
): ExpenseCategoryTotals {
  const totals: ExpenseCategoryTotals = { obuwie: 0, podatki: 0, wyplaty: 0, other: 0 };
  for (const expense of expenses) {
    const category = (expense.category ?? "").toLowerCase().trim();
    const amount = expense.amount ?? 0;
    if (category === "obuwie") totals.obuwie += amount;
    else if (category === "podatki") totals.podatki += amount;
    else if (category === "wyplaty" || category === "wypłaty") totals.wyplaty += amount;
    else totals.other += amount;
  }
  return totals;
}
