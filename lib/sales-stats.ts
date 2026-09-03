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

export type ProfitPerPairBucket = {
  label: string;
  min: number;
  max: number | null;
  count: number;
  totalProfit: number;
};

const PROFIT_BUCKET_DEFS: { label: string; min: number; max: number | null }[] = [
  { label: "Strata (poniżej 0 zł)", min: -Infinity, max: 0 },
  { label: "0–20 zł", min: 0, max: 20 },
  { label: "20–50 zł", min: 20, max: 50 },
  { label: "50–100 zł", min: 50, max: 100 },
  { label: "100–200 zł", min: 100, max: 200 },
  { label: "200 zł i więcej", min: 200, max: null },
];

// Average margin hides the spread — one 500 zł hit can mask five pairs that
// sold at a loss. This buckets net_profit per individual pair instead of per
// sale row. A multi-pair sale has no real per-pair fee/VAT/tax split stored
// (those are only computed once for the whole sale), so its net_profit is
// allocated across pairs proportionally to each pair's own price — a fair
// approximation since fees/VAT scale with price anyway. A single aggregate
// row covering `quantity` pairs (legacy bulk imports) splits evenly, same
// assumption buildBreakdown already makes for its count.
export function buildProfitPerPairDistribution(sales: SaleRow[]): ProfitPerPairBucket[] {
  const buckets: ProfitPerPairBucket[] = PROFIT_BUCKET_DEFS.map((d) => ({ ...d, count: 0, totalProfit: 0 }));

  function addToBucket(profit: number) {
    const bucket =
      buckets.find((b) => profit >= b.min && (b.max === null || profit < b.max)) ??
      buckets[buckets.length - 1];
    bucket.count += 1;
    bucket.totalProfit += profit;
  }

  for (const sale of sales) {
    const netProfit = sale.net_profit ?? 0;
    const items = Array.isArray(sale.items) && sale.items.length > 1 ? sale.items : null;

    if (items) {
      const priceSum = items.reduce((sum, it) => sum + (it.price ?? 0), 0);
      if (priceSum > 0) {
        for (const it of items) addToBucket(netProfit * ((it.price ?? 0) / priceSum));
      } else {
        const even = netProfit / items.length;
        for (let i = 0; i < items.length; i++) addToBucket(even);
      }
    } else {
      const qty = sale.quantity ?? 1;
      const even = netProfit / qty;
      for (let i = 0; i < qty; i++) addToBucket(even);
    }
  }

  return buckets;
}

export type DailyPoint = {
  date: string;
  revenue: number;
  profit: number;
  quantity: number;
};

// Brand is free text typed per-sale, so the same brand fragments across
// case variants ("HOKA" / "Hoka") and brand+model entries ("HOKA BONDI 8",
// "Nike Air") typed instead of the bare brand. This groups raw brand
// strings case-insensitively, then folds a longer entry into a shorter one
// that both (a) actually occurs on its own in the data and (b) is a
// word-boundary prefix of the longer one — so "HOKA BONDI 8" and
// "HOKA ARAHI 7" absorb into "HOKA" whenever "HOKA" is itself a real entry,
// without a hardcoded brand list. The display label for each merged group
// is whichever original casing was most common. Returns a map from every
// raw (unmerged, original-cased) brand string seen to its canonical
// display label.
function canonicalizeBrandLabels(rawLabels: string[]): Map<string, string> {
  // Count occurrences per case-insensitive, whitespace-normalized key, and
  // track the most common original casing to use as that key's label.
  const variantCountsByKey = new Map<string, Map<string, number>>();
  for (const raw of rawLabels) {
    const normalized = raw.trim().replace(/\s+/g, " ");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    const variants = variantCountsByKey.get(key) ?? new Map<string, number>();
    variants.set(normalized, (variants.get(normalized) ?? 0) + 1);
    variantCountsByKey.set(key, variants);
  }

  const labelByKey = new Map<string, string>();
  for (const [key, variants] of variantCountsByKey) {
    let best = "";
    let bestCount = -1;
    for (const [variant, count] of variants) {
      if (count > bestCount) {
        best = variant;
        bestCount = count;
      }
    }
    labelByKey.set(key, best);
  }

  // Shortest keys first, so a key folds into the shortest real prefix that
  // exists on its own — e.g. "nike air force 1" jumps straight to "nike"
  // rather than stopping at an intermediate "nike air" if both exist.
  const keysByLength = Array.from(variantCountsByKey.keys()).sort((a, b) => a.length - b.length);
  const canonicalKeyOf = new Map<string, string>();
  for (const key of keysByLength) {
    let target = key;
    for (const shorter of keysByLength) {
      if (shorter.length >= key.length) break;
      if (key.startsWith(shorter + " ")) {
        target = shorter;
        break;
      }
    }
    canonicalKeyOf.set(key, target);
  }

  const labelByRaw = new Map<string, string>();
  for (const raw of rawLabels) {
    const normalized = raw.trim().replace(/\s+/g, " ");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    const canonicalKey = canonicalKeyOf.get(key)!;
    labelByRaw.set(raw, labelByKey.get(canonicalKey)!);
  }
  return labelByRaw;
}

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

export type DiscountStats = {
  matchedCount: number;
  fullPriceCount: number;
  discountedCount: number;
  averageDiscountPercent: number;
  averageDiscountAmount: number;
};

// Compares each sale's actual price against the item's asking price at
// intake — only for single-pair sales matched to exactly one item with a
// price, same forgiving/skip-if-ambiguous approach as the rest of this file.
// Multi-pair sales are skipped: a single asking price can't be meaningfully
// compared against a price covering more than one pair.
export function computeDiscountStats(
  sales: Pick<SaleRow, "quantity" | "items" | "sale_price" | "legacy_shoe_id">[],
  items: MatchableItem[]
): DiscountStats {
  const index = buildItemIndex(items);
  let matchedCount = 0;
  let fullPriceCount = 0;
  let discountedCount = 0;
  let discountPercentSum = 0;
  let discountAmountSum = 0;

  for (const sale of sales) {
    if ((sale.quantity ?? 1) > 1) continue;
    if (Array.isArray(sale.items) && sale.items.length > 1) continue;
    if (sale.sale_price == null) continue;

    const item = matchItemForShoeId(sale.legacy_shoe_id, index);
    if (!item || item.price == null || item.price <= 0) continue;

    matchedCount++;
    const diff = item.price - sale.sale_price;
    if (diff <= 0) {
      fullPriceCount++;
    } else {
      discountedCount++;
      discountAmountSum += diff;
      discountPercentSum += (diff / item.price) * 100;
    }
  }

  return {
    matchedCount,
    fullPriceCount,
    discountedCount,
    averageDiscountPercent: discountedCount > 0 ? discountPercentSum / discountedCount : 0,
    averageDiscountAmount: discountedCount > 0 ? discountAmountSum / discountedCount : 0,
  };
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
  profitPerPair: ProfitPerPairBucket[];
  discountStats: DiscountStats;
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

  // Brand prefers the sale's own stored `brand` column (set directly on the
  // sale, or auto-filled from a matched item at entry time) — only falling
  // back to the best-effort legacy_shoe_id→item match for older rows saved
  // before that column existed. Size/batch have no such direct column yet,
  // so they still rely purely on the fuzzy match.
  const brandIndex = buildItemIndex(items);
  const rawBrandFor = (sale: SaleRow): string => {
    if (sale.brand) return sale.brand;
    const item = matchItemForShoeId(sale.legacy_shoe_id, brandIndex);
    return item?.brand ?? "";
  };
  const brandLabelByRaw = canonicalizeBrandLabels(sales.map(rawBrandFor));
  const byBrand = buildBreakdown(sales, (sale) => {
    const raw = rawBrandFor(sale);
    return raw ? brandLabelByRaw.get(raw)! : "—";
  });
  const bySize = buildItemLinkedBreakdown(sales, items, (item) => item.size ?? "—");
  const byBatch = buildItemLinkedBreakdown(sales, items, (item) => item.batchLabel ?? "—");
  const profitPerPair = buildProfitPerPairDistribution(sales);
  const discountStats = computeDiscountStats(sales, items);

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
    profitPerPair,
    discountStats,
  };
}
