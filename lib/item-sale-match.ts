// Best-effort matching between a sale row and the item it came from. Sales
// have no real foreign key into `items` — they carry a free-typed
// "legacy_shoe_id" field instead, which is the same old/manual number
// written on the physical item (see items.legacy_number). Multi-pair sales
// join several shoe ids with ", " — each part is checked individually. A
// sale with no match or an unparsable id is simply left out of whatever's
// being reported/synced, same forgiving approach throughout this layer.
//
// Matching is primarily by exact legacy_number string — items.internal_number
// (this app's own 1,2,3… counter) essentially never coincides with an old
// shoe id like "R15699", so it's only used as a last-resort key for the rare
// item that has no legacy_number at all.

export type MatchableItem = {
  internalNumber: number;
  legacyNumber: string | null;
  batchLabel: string | null;
  brand: string | null;
  size: string | null;
  price?: number | null;
};

export function parseShoeId(
  shoeId: string | null | undefined
): { prefix: string; internalNumber: number } | null {
  if (!shoeId) return null;
  const match = shoeId.trim().match(/^([A-Za-z]*)(\d+)$/);
  if (!match) return null;
  const [, prefix, numberStr] = match;
  const internalNumber = Number(numberStr);
  if (!Number.isInteger(internalNumber)) return null;
  return { prefix, internalNumber };
}

function indexKey(item: MatchableItem): string {
  const legacy = item.legacyNumber?.trim();
  return legacy || `${item.batchLabel ?? ""}${item.internalNumber}`;
}

export function buildItemIndex(
  items: MatchableItem[]
): Map<string, MatchableItem[]> {
  const map = new Map<string, MatchableItem[]>();
  for (const item of items) {
    const key = indexKey(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

export type SaleForPriceMatch = {
  legacy_shoe_id: string | null;
  sale_price: number | null;
  items: { shoeId: string; price: number; cost: number; itemId?: string | null }[] | null;
};

export type SalePriceIndex = {
  byItemId: Map<string, number>;
  byLegacyNumber: Map<string, number>;
};

// Reverse of the usual direction: given items already fetched, look up what
// each one actually sold for (vs items.price, the asking price at intake).
// A multi-pair sale's own items[] carries a precise itemId when the
// employee manually resolved which physical pair — used first when present.
// Otherwise falls back to legacy_shoe_id, but only for single-pair sales,
// and only when a legacy number shows up in exactly one sale — the same
// old number can get reused for a different physical pair at a later
// intake, so a number matching more than one sale is ambiguous and skipped
// rather than guessed (see the R15615/R15706 correction this convention is
// modeled on).
export function buildSalePriceIndex(sales: SaleForPriceMatch[]): SalePriceIndex {
  const byItemId = new Map<string, number>();
  const candidatesByLegacyNumber = new Map<string, number[]>();

  for (const sale of sales) {
    if (sale.sale_price == null) continue;

    const items = Array.isArray(sale.items) ? sale.items : null;
    if (items && items.length > 0) {
      for (const it of items) {
        if (it.itemId && it.price != null) byItemId.set(it.itemId, it.price);
      }
      continue;
    }

    const ids = (sale.legacy_shoe_id ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 1) {
      const id = ids[0];
      const list = candidatesByLegacyNumber.get(id) ?? [];
      list.push(sale.sale_price);
      candidatesByLegacyNumber.set(id, list);
    }
  }

  const byLegacyNumber = new Map<string, number>();
  for (const [id, prices] of candidatesByLegacyNumber) {
    if (prices.length === 1) byLegacyNumber.set(id, prices[0]);
  }

  return { byItemId, byLegacyNumber };
}

export function matchItemForShoeId(
  shoeId: string | null | undefined,
  index: Map<string, MatchableItem[]>
): MatchableItem | null {
  if (!shoeId) return null;
  for (const part of shoeId.split(",").map((p) => p.trim())) {
    if (!part) continue;
    const candidates = index.get(part) ?? [];
    // Ambiguous exact-string collision (e.g. a duplicate legacy_number) —
    // don't guess which one it was, same forgiving approach as elsewhere.
    if (candidates.length === 1) return candidates[0];
  }
  return null;
}
