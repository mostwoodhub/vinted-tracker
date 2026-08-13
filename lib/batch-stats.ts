import type { SaleRow } from "@/lib/sales-types";

// The legacy app encoded the purchase batch directly in the shoe id: shoes
// bought as part of batch "Q" got ids like "Q16362". Verified against a real
// historical export ("Partie obuwia" sheet): batch Q had cost 75900.00 and
// Przychód netto 5922.66 -> Status "Pozostało 69977.34 zł", which only
// reconciles if Przychód netto = sum(net_profit) of sales whose
// legacy_shoe_id starts with that batch's letter(s).
export type BatchPerformance = {
  name: string;
  cost: number;
  netRevenue: number;
  remaining: number;
  breakEvenReached: boolean;
  saleCount: number;
};

export function computeBatchPerformance(
  allSales: SaleRow[],
  batchCosts: { batch_name: string | null; amount: number | null }[]
): BatchPerformance[] {
  const costByBatch = new Map<string, number>();
  for (const row of batchCosts) {
    if (!row.batch_name) continue;
    costByBatch.set(row.batch_name, (costByBatch.get(row.batch_name) ?? 0) + (row.amount ?? 0));
  }

  return Array.from(costByBatch.entries())
    .map(([name, cost]) => {
      const matched = allSales.filter((sale) =>
        (sale.legacy_shoe_id ?? "").startsWith(name)
      );
      const netRevenue = matched.reduce((sum, s) => sum + (s.net_profit ?? 0), 0);
      const remaining = cost - netRevenue;
      return {
        name,
        cost,
        netRevenue,
        remaining: Math.abs(remaining),
        breakEvenReached: remaining <= 0,
        saleCount: matched.length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
