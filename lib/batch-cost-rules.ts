import "server-only";

// Fixed per-batch cost policy the owner gave directly (2026-08-25). Batches
// A/D/J/M/R price shoes by resale-price tier — cost varies a lot within the
// batch — every other listed batch was bought at one flat per-pair cost.
// Applied automatically at intake/edit so cost_price doesn't need a manual
// CostEditor visit for a batch this is already known for. A batch with no
// rule here (a genuinely new purchase) resolves to null, same as before —
// nothing is invented for batches the owner hasn't priced yet.
const TIERED_COST_BATCHES = new Set(["A", "D", "J", "M", "R"]);

function tieredCostPrice(price: number): number {
  if (price <= 100) return 45;
  if (price <= 200) return 80;
  return 120;
}

const FLAT_COST_BY_BATCH: Record<string, number> = {
  B: 110,
  C: 120,
  E: 150,
  F: 55,
  G: 135,
  H: 170,
  I: 135,
  K: 110,
  L: 170,
  N: 130,
  O: 65,
};

export function suggestCostPrice(batchLabel: string | null, price: number | null): number | null {
  if (!batchLabel || price == null) return null;
  if (TIERED_COST_BATCHES.has(batchLabel)) return tieredCostPrice(price);
  return FLAT_COST_BY_BATCH[batchLabel] ?? null;
}
