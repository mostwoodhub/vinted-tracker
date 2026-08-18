import type { SaleRow } from "@/lib/sales-types";

// The legacy app encoded the purchase batch directly in the shoe id: shoes
// bought as part of batch "Q" got ids like "Q16362" — matched below by
// extracting that letter prefix.
//
// Revenue counted per sale is sale_price minus platform fee, VAT, and
// income tax — deliberately NOT minus cost_price. cost_price is already
// what the batch's own purchase_cost/koszt partii represents, so netting it
// out here too would double-subtract it against the batch cost.
function saleRevenueAfterTax(
  sale: Pick<SaleRow, "sale_price" | "fee_amount" | "vat_amount" | "income_tax_amount">
): number {
  return (
    (sale.sale_price ?? 0) -
    (sale.fee_amount ?? 0) -
    (sale.vat_amount ?? 0) -
    (sale.income_tax_amount ?? 0)
  );
}

export type BatchPerformance = {
  name: string;
  cost: number;
  netRevenue: number;
  remaining: number;
  breakEvenReached: boolean;
  saleCount: number;
};

// Multi-pair sales join several shoe ids with ", " — check each one. A naive
// `startsWith` check is unsafe: bulk-import placeholder ids like
// "IMP0930183" start with "I", which would wrongly attribute ~6,000
// unrelated sales to a batch literally named "I". Extracting the full
// leading letter run and comparing it exactly avoids that class of false
// positive (verified against real data — "I" naive-matched 6167 sales vs. 18
// with exact matching).
export function saleMatchesBatchLabel(legacyShoeId: string | null, label: string): boolean {
  if (!legacyShoeId) return false;
  return legacyShoeId
    .split(",")
    .map((part) => part.trim())
    .some((part) => {
      const match = part.match(/^([A-Za-z]+)(\d+)$/);
      return match !== null && match[1] === label;
    });
}

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
      const matched = allSales.filter((sale) => saleMatchesBatchLabel(sale.legacy_shoe_id, name));
      const netRevenue = matched.reduce((sum, s) => sum + saleRevenueAfterTax(s), 0);
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

// Sales recorded in the live `sales` table (imported or manually entered)
// that match a real batch's label by shoe-id prefix — used to top up the
// manually entered / spreadsheet-imported sales_amount and sold_pairs
// baseline on "Partie zakupowe" cards, rather than replacing it.
export function computeLinkedSales(
  allSales: SaleRow[],
  label: string
): { amount: number; count: number } {
  const matched = allSales.filter((sale) => saleMatchesBatchLabel(sale.legacy_shoe_id, label));
  return {
    amount: matched.reduce((sum, s) => sum + saleRevenueAfterTax(s), 0),
    count: matched.length,
  };
}

export type BatchPayback = {
  label: string;
  cost: number;
  revenue: number;
  remaining: number;
  breakEvenReached: boolean;
};

// All-time cost-recovery view combining both batch sources into one row per
// label, same merge rule as /batches-archive: a real `batches` row's own
// purchase_cost/sales_amount baseline wins over a same-label legacy expense
// entry, live `sales` matches are added on top either way.
export function computeBatchPayback(
  allSales: SaleRow[],
  legacyBatchCosts: { batch_name: string | null; amount: number | null }[],
  realBatches: { label: string | null; purchase_cost: number | null; sales_amount: number | null }[]
): BatchPayback[] {
  const costByLabel = new Map<string, number>();
  for (const row of legacyBatchCosts) {
    if (!row.batch_name) continue;
    costByLabel.set(row.batch_name, (costByLabel.get(row.batch_name) ?? 0) + (row.amount ?? 0));
  }

  const baselineSalesByLabel = new Map<string, number>();
  for (const b of realBatches) {
    if (!b.label) continue;
    costByLabel.set(b.label, b.purchase_cost ?? 0);
    baselineSalesByLabel.set(b.label, b.sales_amount ?? 0);
  }

  return Array.from(costByLabel.entries())
    .map(([label, cost]) => {
      const linked = computeLinkedSales(allSales, label);
      const revenue = (baselineSalesByLabel.get(label) ?? 0) + linked.amount;
      const remaining = cost - revenue;
      return {
        label,
        cost,
        revenue,
        remaining: Math.abs(remaining),
        breakEvenReached: remaining <= 0,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
