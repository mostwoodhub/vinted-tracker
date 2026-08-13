export type SaleItem = {
  shoeId: string;
  price: number;
  cost: number;
};

export type SaleRow = {
  id: string;
  created_at: string | null;
  sale_date: string | null;
  platform: string | null;
  legacy_shoe_id: string | null;
  buyer_name: string | null;
  cost_price: number | null;
  sale_price: number | null;
  country: string | null;
  fee_percent: number | null;
  fee_amount: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  vat_mode: string | null;
  income_tax_applied: boolean | null;
  income_tax_amount: number | null;
  net_profit: number | null;
  account_name: string | null;
  quantity: number | null;
  confirmed: boolean | null;
  photo_url: string | null;
  photo_urls: string[] | null;
  label_url: string | null;
  label_url2: string | null;
  label_filename: string | null;
  label_filename2: string | null;
  legacy_user_id: string | null;
  items: SaleItem[] | null;
};

export const SALE_EXPORT_COLUMNS = "*";

// A sale is "multi-pair" when its items breakdown has more than one line —
// verified against migrated data: every historical row with quantity > 1
// (10/10) carries a matching items[] array, one entry per pair.
export function isMultiPairSale(sale: Pick<SaleRow, "items">): boolean {
  return Array.isArray(sale.items) && sale.items.length > 1;
}

// Fields a manually-entered sale needs to be considered "complete" for
// proper cost/geo/account tracking. Historical migrated rows are always
// complete (0 nulls across cost_price/account_name/country in 3848 rows);
// this only fires for new entries created with fields left blank.
export function isSaleIncomplete(
  sale: Pick<SaleRow, "cost_price" | "account_name" | "country">
): boolean {
  return sale.cost_price == null || !sale.account_name || !sale.country;
}
