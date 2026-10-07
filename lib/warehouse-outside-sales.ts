// Sales whose pair has no matching sold item in the warehouse — most
// historical sales were recorded before items started being added to the
// app (or the pair was sold under a reused number), so the warehouse's own
// "Sprzedano" count only ever covered a fraction of what actually sold per
// batch. This lists the rest, straight from `sales`, so the per-batch view
// can show them.
//
// Batch = leading letters of the shoe number ("R15699" -> "R"), the same
// convention as saleMatchesBatchLabel. A number reused for different pairs
// can appear in several sales; each sold warehouse item with that number
// accounts for one of them (the most recent), the remaining older ones are
// the ones "outside".

export type SaleForOutsideCheck = {
  id: string;
  legacy_shoe_id: string | null;
  sale_price: number | null;
  sale_date: string | null;
  buyer_name: string | null;
  account_name: string | null;
  photo_url: string | null;
  photo_urls: string[] | null;
  items: { shoeId: string; price: number; cost: number; itemId?: string | null }[] | null;
};

export type OutsideSale = {
  key: string;
  saleId: string;
  number: string;
  batchLabel: string;
  saleDate: string | null;
  price: number | null;
  buyer: string | null;
  account: string | null;
  photoUrl: string | null;
};

const ARCHIVE_ACCOUNT = "Archiwum 2025";

export function findSalesOutsideWarehouse(
  sales: SaleForOutsideCheck[],
  warehouseItems: { legacy_number: string | null; status: string }[],
  batchLabels: string[]
): OutsideSale[] {
  const labels = new Set(batchLabels);

  const soldItemsByNumber = new Map<string, number>();
  for (const item of warehouseItems) {
    if (!item.legacy_number || item.status !== "sold") continue;
    soldItemsByNumber.set(item.legacy_number, (soldItemsByNumber.get(item.legacy_number) ?? 0) + 1);
  }

  const entriesByNumber = new Map<string, OutsideSale[]>();
  for (const sale of sales) {
    if (sale.account_name === ARCHIVE_ACCOUNT) continue;

    const multi = sale.items && sale.items.length > 1;
    const parts: { number: string; price: number | null }[] = multi
      ? sale.items!.map((i) => ({ number: (i.shoeId ?? "").trim(), price: i.price ?? null }))
      : (sale.legacy_shoe_id ?? "")
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
          .map((number, _, all) => ({ number, price: all.length === 1 ? sale.sale_price : null }));

    for (const { number, price } of parts) {
      const match = number.match(/^([A-Za-z]+)\d+$/);
      if (!match || !labels.has(match[1])) continue;
      const list = entriesByNumber.get(number) ?? [];
      list.push({
        key: `${sale.id}:${number}`,
        saleId: sale.id,
        number,
        batchLabel: match[1],
        saleDate: sale.sale_date,
        price,
        buyer: sale.buyer_name,
        account: sale.account_name,
        photoUrl: sale.photo_url ?? sale.photo_urls?.[0] ?? null,
      });
      entriesByNumber.set(number, list);
    }
  }

  const outside: OutsideSale[] = [];
  for (const [number, entries] of entriesByNumber) {
    entries.sort((a, b) => (b.saleDate ?? "").localeCompare(a.saleDate ?? ""));
    const matched = Math.min(entries.length, soldItemsByNumber.get(number) ?? 0);
    outside.push(...entries.slice(matched));
  }
  return outside.sort(
    (a, b) =>
      (b.saleDate ?? "").localeCompare(a.saleDate ?? "") || a.number.localeCompare(b.number)
  );
}
