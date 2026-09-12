import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseNumber } from "@/lib/sales-form-parse";
import { getPayoutRateToPln } from "@/lib/nbp-exchange-rate";
import { VINTED_COUNTRY_PLATFORMS } from "@/lib/vinted-platform-accounts";

// "Vinted DE"/"Vinted IT" carry their own known currency regardless of
// what's set on the selected account's own `currency` column — the
// employee picking that platform is the signal, not the account (an
// account like "Vintusss - V" stays PLN in sales_accounts_archive since
// it's also used for plain PLN sales; only the DE/IT platform choice
// means "this particular sale is in EUR"). Falls back to the account's
// own currency for anything else (any future non-PLN account with no
// dedicated platform shortcut).
export async function resolveSaleCurrency(platform: string, accountName: string): Promise<string> {
  const mapped = VINTED_COUNTRY_PLATFORMS[platform];
  if (mapped) return mapped.currency;

  if (!accountName) return "PLN";
  const { data: account } = await supabaseAdmin
    .from("sales_accounts_archive")
    .select("currency")
    .eq("name", accountName)
    .maybeSingle();
  return account?.currency?.trim() || "PLN";
}

export type SaleCurrencyAudit = {
  original_currency: string;
  original_sale_price: number;
  exchange_rate: number;
} | null;

// Mutates formData's salePrice/feeAmount in place, converting them from the
// selling account's own currency into PLN. costPrice is deliberately left
// untouched — stock is always bought in PLN regardless of which account it
// ends up sold through, only the sale side (and Vinted's own fee, charged
// in the same currency as the sale) is ever in EUR. Every downstream
// calculation (fee %, VAT, income tax, net profit, all of statistics)
// already assumes PLN and stays untouched otherwise. feePercent is derived
// from feeAmount/salePrice, so converting both by the same rate keeps that
// ratio correct automatically; only the absolute PLN amounts change.
//
// Returns the pre-conversion values (for the audit columns) or null when
// the account is already PLN (the overwhelming majority) — callers should
// spread the result into their insert/update only when it's non-null.
export async function applySaleCurrencyConversion(formData: FormData): Promise<SaleCurrencyAudit> {
  const platform = String(formData.get("platform") ?? "").trim();
  const accountName = String(formData.get("accountName") ?? "").trim();

  const currency = await resolveSaleCurrency(platform, accountName);
  if (currency === "PLN") return null;

  const saleDate = String(formData.get("saleDate") ?? "").trim();
  if (!saleDate) return null; // parseSaleFormFields will reject the missing date itself

  const originalSalePrice = parseNumber(formData.get("salePrice"));
  const originalFeeAmount = parseNumber(formData.get("feeAmount"));

  const rate = await getPayoutRateToPln(currency, saleDate);

  formData.set("salePrice", String(originalSalePrice * rate));
  formData.set("feeAmount", String(originalFeeAmount * rate));

  return {
    original_currency: currency,
    original_sale_price: originalSalePrice,
    exchange_rate: rate,
  };
}
