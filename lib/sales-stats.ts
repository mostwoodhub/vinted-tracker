import type { SaleRow } from "@/lib/sales-types";
import { categorizeExpenses, type ExpenseCategoryTotals } from "@/lib/expense-categories";
import {
  buildItemIndex,
  matchItemForShoeId,
  type MatchableItem,
} from "@/lib/item-sale-match";

export type { MatchableItem };

export type ExpenseRow = {
  category?: string | null;
  amount: number | null;
};

export type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
};

export type Breakdown = { key: string; count: number; totalProfit: number; totalRevenue: number };

export function buildBreakdown(sales: SaleRow[], keyFn: (sale: SaleRow) => string): Breakdown[] {
  const map = new Map<string, Breakdown>();
  for (const sale of sales) {
    const label = keyFn(sale) || "—";
    const entry = map.get(label) ?? { key: label, count: 0, totalProfit: 0, totalRevenue: 0 };
    entry.count += sale.quantity ?? 1;
    entry.totalProfit += sale.net_profit ?? 0;
    entry.totalRevenue += sale.sale_price ?? 0;
    map.set(label, entry);
  }
  return Array.from(map.values()).sort((a, b) => b.totalProfit - a.totalProfit);
}

export type DailyPoint = {
  date: string;
  revenue: number;
  profit: number;
  quantity: number;
};

// Groups sales by an item attribute (brand/size/batch) reached via the
// best-effort legacy_shoe_id match. Sales that can't be matched to an item
// fall into the "—" bucket, same as any other missing label.
export function buildItemLinkedBreakdown(
  sales: SaleRow[],
  items: MatchableItem[],
  keyFn: (item: MatchableItem) => string
): Breakdown[] {
  const index = buildItemIndex(items);
  return buildBreakdown(sales, (sale) => {
    const item = matchItemForShoeId(sale.legacy_shoe_id, index);
    return item ? keyFn(item) : "—";
  });
}

export function buildDailySeries(sales: SaleRow[]): DailyPoint[] {
  const map = new Map<string, DailyPoint>();
  for (const sale of sales) {
    if (!sale.sale_date) continue;
    const entry = map.get(sale.sale_date) ?? {
      date: sale.sale_date,
      revenue: 0,
      profit: 0,
      quantity: 0,
    };
    entry.revenue += sale.sale_price ?? 0;
    entry.profit += sale.net_profit ?? 0;
    entry.quantity += sale.quantity ?? 1;
    map.set(sale.sale_date, entry);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export type SalesStatistics = {
  count: number;
  totalRevenue: number;
  totalQuantity: number;
  totalCostOwn: number;
  totalFees: number;
  totalVat: number;
  totalIncomeTax: number;
  salesProfit: number;
  expenseCategories: ExpenseCategoryTotals;
  totalExpensesAmount: number;
  finalNetProfit: number;
  cashIn: number;
  cashOut: number;
  cashBalance: number;
  averageMargin: number;
  byPlatform: Breakdown[];
  byAccount: Breakdown[];
  byCountry: Breakdown[];
  byEmployee: Breakdown[];
  byBrand: Breakdown[];
  bySize: Breakdown[];
  byBatch: Breakdown[];
};

export function computeSalesStatistics(
  sales: SaleRow[],
  expenses: ExpenseRow[],
  profiles: ProfileRow[],
  items: MatchableItem[] = []
): SalesStatistics {
  const totalRevenue = sales.reduce((sum, s) => sum + (s.sale_price ?? 0), 0);
  const totalQuantity = sales.reduce((sum, s) => sum + (s.quantity ?? 1), 0);
  // "Liczba sprzedaży" = suma par (quantity), nie liczba wierszy — dla
  // zwykłych sprzedaży to prawie zawsze to samo (quantity=1), ale zbiorcze
  // wpisy archiwalne (np. "Archiwum 2025") mają quantity > 1 na wiersz i
  // liczenie wierszy drastycznie zaniżałoby wynik.
  const count = totalQuantity;
  const totalCostOwn = sales.reduce((sum, s) => sum + (s.cost_price ?? 0), 0);
  const totalFees = sales.reduce((sum, s) => sum + (s.fee_amount ?? 0), 0);
  const totalVat = sales.reduce((sum, s) => sum + (s.vat_amount ?? 0), 0);
  const totalIncomeTax = sales.reduce((sum, s) => sum + (s.income_tax_amount ?? 0), 0);
  const salesProfit = sales.reduce((sum, s) => sum + (s.net_profit ?? 0), 0);

  const expenseCategories = categorizeExpenses(expenses.map((e) => ({ category: e.category ?? null, amount: e.amount })));
  const totalExpensesAmount =
    expenseCategories.obuwie + expenseCategories.podatki + expenseCategories.wyplaty + expenseCategories.other;

  const finalNetProfit = salesProfit - totalExpensesAmount;

  // Cash flow is a simpler, distinct metric from accounting profit: cash that
  // physically moved. Wpłynęło = gross sale price received; Wypłynęło = only
  // recorded expenses (cost_price/fee/vat/tax are bookkeeping deductions
  // already reflected inside salesProfit, not separate cash movements here).
  // Verified against a real historical export from the legacy app: for a
  // period with salesProfit 19224.39 and totalExpensesAmount 79220.00, the
  // old system reported Wypłynęło = 79220.00 (not cost+fee+vat+tax+expenses)
  // and Saldo = 8977.23 = totalRevenue(88197.23) - 79220.00 exactly.
  const cashIn = totalRevenue;
  const cashOut = totalExpensesAmount;
  const cashBalance = cashIn - cashOut;

  const margins = sales
    .filter((s) => s.sale_price != null && s.sale_price !== 0 && s.net_profit != null)
    .map((s) => (s.net_profit as number) / (s.sale_price as number));
  const averageMargin =
    margins.length > 0 ? (margins.reduce((sum, m) => sum + m, 0) / margins.length) * 100 : 0;

  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const byPlatform = buildBreakdown(sales, (s) => s.platform ?? "");
  const byAccount = buildBreakdown(sales, (s) => s.account_name ?? "");
  const byCountry = buildBreakdown(sales, (s) => s.country ?? "");
  const byEmployee = buildBreakdown(sales, (s) => {
    if (!s.legacy_user_id) return "—";
    const profile = profileById.get(s.legacy_user_id);
    return profile?.display_name || profile?.email || "Nieznany";
  });

  // Best-effort — only sales whose legacy_shoe_id matches a known item
  // contribute here; everything else lands in the "—" bucket.
  const byBrand = buildItemLinkedBreakdown(sales, items, (item) => item.brand ?? "—");
  const bySize = buildItemLinkedBreakdown(sales, items, (item) => item.size ?? "—");
  const byBatch = buildItemLinkedBreakdown(sales, items, (item) => item.batchLabel ?? "—");

  return {
    count,
    totalRevenue,
    totalQuantity,
    totalCostOwn,
    totalFees,
    totalVat,
    totalIncomeTax,
    salesProfit,
    expenseCategories,
    totalExpensesAmount,
    finalNetProfit,
    cashIn,
    cashOut,
    cashBalance,
    averageMargin,
    byPlatform,
    byAccount,
    byCountry,
    byEmployee,
    byBrand,
    bySize,
    byBatch,
  };
}
