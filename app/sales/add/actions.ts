"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ALL_ROLES, checkRole, getEffectiveRoles } from "@/lib/auth";
import { parseSaleFormFields } from "@/lib/sales-form-parse";
import { uploadSaleFile, uploadSalePhotos } from "@/lib/sales-upload";
import { markItemSoldByShoeId } from "@/lib/item-sale-link";

export type AddSaleState = {
  status: "idle" | "error";
  error?: string;
};

export async function createSale(
  _prevState: AddSaleState,
  formData: FormData
): Promise<AddSaleState> {
  // Any authenticated employee can record a sale — approval is admin-only,
  // enforced below regardless of the role that submitted this form.
  const access = await checkRole(...ALL_ROLES);
  if (!access.ok) return { status: "error", error: access.error };
  const isAdmin = getEffectiveRoles(access.employee).has("admin");

  const parsed = parseSaleFormFields(formData);
  if ("error" in parsed) return { status: "error", error: parsed.error };

  // Non-admin submitters can never mark their own entry confirmed, no
  // matter what the client sent — only an admin can approve via Zatwierdź.
  const confirmed = isAdmin && formData.get("confirmed") === "on";
  const photos = formData
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const labelFile = formData.get("label");
  const labelFile2 = formData.get("label2");

  let photoUrls: string[];
  try {
    photoUrls = await uploadSalePhotos(photos);
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : "Nie udało się przesłać zdjęć" };
  }

  let labelResult: { url: string | null; filename: string | null } = { url: null, filename: null };
  let label2Result: { url: string | null; filename: string | null } = { url: null, filename: null };
  try {
    if (labelFile instanceof File && labelFile.size > 0) labelResult = await uploadSaleFile(labelFile);
    if (labelFile2 instanceof File && labelFile2.size > 0) label2Result = await uploadSaleFile(labelFile2);
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : "Nie udało się przesłać etykiety" };
  }

  const { error } = await supabaseAdmin.from("sales").insert({
    id: randomUUID(),
    sale_date: parsed.saleDate,
    platform: parsed.platform,
    legacy_shoe_id: parsed.legacyShoeId || null,
    buyer_name: parsed.buyerName || null,
    quantity: parsed.quantity,
    cost_price: parsed.costPrice || null,
    sale_price: parsed.salePrice,
    country: parsed.country || null,
    account_name: parsed.accountName || null,
    fee_percent: parsed.feePercent,
    fee_amount: parsed.feeAmount,
    vat_rate: parsed.vatRate,
    vat_amount: parsed.vatAmount,
    vat_mode: parsed.vatMode,
    income_tax_applied: parsed.incomeTaxApplied,
    income_tax_amount: parsed.incomeTaxAmount,
    net_profit: parsed.netProfit,
    confirmed,
    photo_url: photoUrls[0] ?? null,
    photo_urls: photoUrls,
    items: parsed.items,
    label_url: labelResult.url,
    label_filename: labelResult.filename,
    label_url2: label2Result.url,
    label_filename2: label2Result.filename,
  });

  if (error) {
    return { status: "error", error: error.message };
  }

  // Best-effort: mark the matching warehouse item(s) sold so batch "Sprzedano
  // X z N" counts pick this up. Never blocks the sale itself — see
  // markItemSoldByShoeId for why this can legitimately be a no-op.
  if (parsed.items && parsed.items.length > 0) {
    await Promise.all(parsed.items.map((item) => markItemSoldByShoeId(item.shoeId)));
  } else {
    await markItemSoldByShoeId(parsed.legacyShoeId);
  }

  redirect("/sales");
}
