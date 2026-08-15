// Best-effort matching between a sale row and the item it came from, based
// on the free-typed "legacy_shoe_id" field (e.g. "ZA16678" = batch label
// "ZA" + item internal_number 16678) — sales have no real foreign key into
// `items`. Used for read-only reporting (margin by brand/size/batch); a sale
// with no match or an unparsable id is simply left out of the breakdown,
// same forgiving approach as lib/item-sale-link.ts uses for the "sold"
// status sync.

export type MatchableItem = {
  internalNumber: number;
  batchLabel: string | null;
  brand: string | null;
  size: string | null;
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

export function buildItemIndex(
  items: MatchableItem[]
): Map<number, MatchableItem[]> {
  const map = new Map<number, MatchableItem[]>();
  for (const item of items) {
    const list = map.get(item.internalNumber) ?? [];
    list.push(item);
    map.set(item.internalNumber, list);
  }
  return map;
}

export function matchItemForShoeId(
  shoeId: string | null | undefined,
  index: Map<number, MatchableItem[]>
): MatchableItem | null {
  const parsed = parseShoeId(shoeId);
  if (!parsed) return null;
  const candidates = index.get(parsed.internalNumber) ?? [];
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  return candidates.find((c) => c.batchLabel === (parsed.prefix || null)) ?? null;
}
