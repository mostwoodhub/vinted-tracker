import "server-only";
import { calcIncomeTaxAmount, calcNetProfit, calcVatAmount } from "@/lib/sales-calc";

function parseNumber(value: FormDataEntryValue | null, fallback = 0): number {
  const str = String(value ?? "").trim().replace(",", ".");
  if (!str) return fallback;
  const n = Number(str);
  return Number.isNaN(n) ? fallback : n;
}

export type ParsedSaleFields = {
  platform: string;
  saleDate: string;
  legacyShoeId: string;
  brand: string;
  buyerName: string;
  quantity: number;
  costPrice: number;
  salePrice: number;
  country: string;
  accountName: string;
  feeAmount: number;
  feePercent: number;
  vatRate: number;
  vatMode: string;
  incomeTaxApplied: boolean;
  vatAmount: number;
  incomeTaxAmount: number;
  netProfit: number;
  items: { shoeId: string; price: number; cost: number; itemId: string | null }[] | null;
  resolvedItemId: string | null;
};

export function parseSaleFormFields(formData: FormData): ParsedSaleFields | { error: string } {
  const platform = String(formData.get("platform") ?? "").trim();
  const saleDate = String(formData.get("saleDate") ?? "").trim();
  const legacyShoeId = String(formData.get("legacyShoeId") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim();
  const buyerName = String(formData.get("buyerName") ?? "").trim();
  const quantity = Math.max(1, Math.round(parseNumber(formData.get("quantity"), 1)));
  const costPrice = parseNumber(formData.get("costPrice"));
  const salePrice = parseNumber(formData.get("salePrice"));
  const country = String(formData.get("country") ?? "").trim();
  const accountName = String(formData.get("accountName") ?? "").trim();
  const feeAmount = parseNumber(formData.get("feeAmount"));
  const vatRate = parseNumber(formData.get("vatRate"));
  const vatMode = String(formData.get("vatMode") ?? "full").trim();
  const incomeTaxApplied = formData.get("incomeTaxApplied") === "on";

  let items: { shoeId: string; price: number; cost: number; itemId: string | null }[] | null = null;
  const itemsRaw = String(formData.get("items") ?? "").trim();
  if (itemsRaw) {
    try {
      const parsed = JSON.parse(itemsRaw);
      if (Array.isArray(parsed) && parsed.length > 1) {
        items = parsed.map((entry) => ({
          shoeId: String(entry.shoeId ?? ""),
          price: Number(entry.price) || 0,
          cost: Number(entry.cost) || 0,
          itemId: entry.itemId ? String(entry.itemId) : null,
        }));
      }
    } catch {
      // malformed items payload — fall back to the plain aggregate fields
    }
  }

  const resolvedItemId = String(formData.get("resolvedItemId") ?? "").trim() || null;

  if (!platform) return { error: "Wybierz platformę" };
  if (!saleDate) return { error: "Podaj datę" };
  if (!salePrice) return { error: "Podaj cenę" };

  const feePercent = salePrice > 0 ? Math.round((feeAmount / salePrice) * 10000) / 100 : 0;
  const vatAmount = calcVatAmount(salePrice, vatRate);
  const incomeTaxAmount = calcIncomeTaxAmount(salePrice, incomeTaxApplied);
  const netProfit = calcNetProfit({ salePrice, costPrice, feeAmount, vatAmount, incomeTaxAmount });

  return {
    platform,
    saleDate,
    legacyShoeId,
    brand,
    buyerName,
    quantity,
    costPrice,
    salePrice,
    country,
    accountName,
    feeAmount,
    feePercent,
    vatRate,
    vatMode,
    incomeTaxApplied,
    vatAmount,
    incomeTaxAmount,
    netProfit,
    items,
    resolvedItemId,
  };
}
