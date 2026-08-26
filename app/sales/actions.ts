"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRole } from "@/lib/auth";
import { parseSaleFormFields } from "@/lib/sales-form-parse";
import { uploadSaleFile, uploadSalePhotos } from "@/lib/sales-upload";
import type { AddSaleState } from "./add/actions";

function revalidateSalesPaths() {
  revalidatePath("/sales");
  revalidatePath("/statistics");
  revalidatePath("/charts");
  revalidatePath("/batches-archive");
}

export async function setSaleConfirmed(saleId: string, confirmed: boolean) {
  const access = await checkRole("admin");
  if (!access.ok) throw new Error(access.error);

  const { error } = await supabaseAdmin
    .from("sales")
    .update({ confirmed })
    .eq("id", saleId);

  if (error) throw new Error(error.message);

  revalidateSalesPaths();
}

// Attaches an extra label file to a sale — fills label_url first, then
// label_url2, covering the "second label on the sheet" case.
export async function attachSaleLabel(saleId: string, file: File) {
  const access = await checkRole("admin");
  if (!access.ok) throw new Error(access.error);

  if (!(file instanceof File) || file.size === 0) throw new Error("Brak pliku");

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("sales")
    .select("label_url, label_url2")
    .eq("id", saleId)
    .single();

  if (fetchError) throw new Error(fetchError.message);

  const uploaded = await uploadSaleFile(file);

  const targetIsFirst = !existing.label_url;
  const update = targetIsFirst
    ? { label_url: uploaded.url, label_filename: uploaded.filename }
    : { label_url2: uploaded.url, label_filename2: uploaded.filename };

  const { error: updateError } = await supabaseAdmin.from("sales").update(update).eq("id", saleId);
  if (updateError) throw new Error(updateError.message);

  revalidateSalesPaths();
}

export async function updateSale(
  saleId: string,
  _prevState: AddSaleState,
  formData: FormData
): Promise<AddSaleState> {
  const access = await checkRole("admin");
  if (!access.ok) return { status: "error", error: access.error };

  const parsed = parseSaleFormFields(formData);
  if ("error" in parsed) return { status: "error", error: parsed.error };

  const confirmed = formData.get("confirmed") === "on";

  const existingPhotoUrls: string[] = (() => {
    try {
      const raw = JSON.parse(String(formData.get("existingPhotoUrls") ?? "[]"));
      return Array.isArray(raw) ? raw.filter((u): u is string => typeof u === "string") : [];
    } catch {
      return [];
    }
  })();
  const newPhotos = formData
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  let uploadedPhotoUrls: string[];
  try {
    uploadedPhotoUrls = await uploadSalePhotos(newPhotos);
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : "Nie udało się przesłać zdjęć" };
  }
  const photoUrls = [...existingPhotoUrls, ...uploadedPhotoUrls];

  const existingLabel1Url = String(formData.get("existingLabel1Url") ?? "").trim();
  const existingLabel1Filename = String(formData.get("existingLabel1Filename") ?? "").trim();
  const existingLabel2Url = String(formData.get("existingLabel2Url") ?? "").trim();
  const existingLabel2Filename = String(formData.get("existingLabel2Filename") ?? "").trim();
  const newLabel1 = formData.get("label");
  const newLabel2 = formData.get("label2");

  let label1Result = { url: existingLabel1Url || null, filename: existingLabel1Filename || null };
  let label2Result = { url: existingLabel2Url || null, filename: existingLabel2Filename || null };
  try {
    if (newLabel1 instanceof File && newLabel1.size > 0) label1Result = await uploadSaleFile(newLabel1);
    if (newLabel2 instanceof File && newLabel2.size > 0) label2Result = await uploadSaleFile(newLabel2);
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : "Nie udało się przesłać etykiety" };
  }

  const { error } = await supabaseAdmin
    .from("sales")
    .update({
      sale_date: parsed.saleDate,
      platform: parsed.platform,
      legacy_shoe_id: parsed.legacyShoeId || null,
      brand: parsed.brand || null,
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
      label_url: label1Result.url,
      label_filename: label1Result.filename,
      label_url2: label2Result.url,
      label_filename2: label2Result.filename,
    })
    .eq("id", saleId);

  if (error) return { status: "error", error: error.message };

  revalidateSalesPaths();
  redirect("/sales");
}

export async function deleteSale(saleId: string) {
  const access = await checkRole("admin");
  if (!access.ok) throw new Error(access.error);

  const { error } = await supabaseAdmin
    .from("sales")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", saleId);

  if (error) throw new Error(error.message);

  revalidateSalesPaths();
}
