import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type BrandSalesHistory = {
  count: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  recent: { price: number; date: string | null }[];
};

const RECENT_LIMIT = 8;

// Pulls this shop's own realized sale prices for a brand — the "closed
// loop" data source for AI price suggestions: a sold item's actual price
// (sales.sale_price, sales.brand — see scripts/2026-08-17-add-sales-brand.sql)
// becomes historical context for evaluating the next item of the same brand,
// instead of the AI guessing blind every time. Confirmed, non-deleted sales
// only, so drafts/unapproved rows don't skew the average.
export async function getBrandSalesHistory(
  brand: string | null | undefined
): Promise<BrandSalesHistory | null> {
  const trimmed = (brand ?? "").trim();
  if (!trimmed) return null;

  const { data } = await supabaseAdmin
    .from("sales")
    .select("sale_price, sale_date")
    .ilike("brand", trimmed)
    .eq("confirmed", true)
    .is("deleted_at", null)
    .not("sale_price", "is", null)
    .order("sale_date", { ascending: false });

  const rows = (data ?? []).filter(
    (r): r is { sale_price: number; sale_date: string | null } => r.sale_price != null
  );

  if (rows.length === 0) return null;

  const prices = rows.map((r) => r.sale_price);
  const count = prices.length;
  const avgPrice = prices.reduce((sum, p) => sum + p, 0) / count;
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const recent = rows
    .slice(0, RECENT_LIMIT)
    .map((r) => ({ price: r.sale_price, date: r.sale_date }));

  return { count, avgPrice, minPrice, maxPrice, recent };
}
