"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ALL_ROLES, checkRole, getEffectiveRoles } from "@/lib/auth";
import { parseSaleFormFields } from "@/lib/sales-form-parse";
import { uploadSaleFile, uploadSalePhotos } from "@/lib/sales-upload";
import { markItemSoldByShoeId } from "@/lib/item-sale-link";
import { sendTelegramMessage } from "@/lib/telegram";
import { formatPln } from "@/lib/format";
import { formatItemNumber } from "@/lib/item-number";

export type AddSaleState = {
  status: "idle" | "error";
  error?: string;
};

export type SoldNumberCheckResult =
  | { sold: false }
  | {
      sold: true;
      saleId: string;
      shoeId: string;
      saleDate: string | null;
      buyerName: string | null;
      salePrice: number | null;
      platform: string | null;
      accountName: string | null;
      photoUrl: string | null;
    };

// Live, as-you-type lookup — itemStatusByNumber (preloaded, instant) only
// covers numbers that exist as a row in `items`, so a legacy number with a
// recorded sale but no warehouse item (common for pre-migration stock) fell
// through to a generic "not in Magazynie" hint with no hint that it was
// already sold. This checks `sales` directly, with a photo, so that gap
// doesn't silently exist.
export async function checkSoldNumber(shoeId: string): Promise<SoldNumberCheckResult> {
  const access = await checkRole(...ALL_ROLES);
  if (!access.ok) return { sold: false };

  const trimmed = shoeId.trim();
  if (!trimmed) return { sold: false };

  const { data } = await supabaseAdmin
    .from("sales")
    .select("id, sale_date, buyer_name, sale_price, platform, account_name, photo_url, photo_urls")
    .eq("legacy_shoe_id", trimmed)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (!data) return { sold: false };

  const photoUrl = data.photo_url ?? data.photo_urls?.[0] ?? null;

  return {
    sold: true,
    saleId: data.id,
    shoeId: trimmed,
    saleDate: data.sale_date,
    buyerName: data.buyer_name,
    salePrice: data.sale_price,
    platform: data.platform,
    accountName: data.account_name,
    photoUrl,
  };
}

export type ItemsByLegacyNumberResult =
  | { ambiguous: false }
  | {
      ambiguous: true;
      candidates: {
        itemId: string;
        displayNumber: string;
        brand: string | null;
        model: string | null;
        status: string;
        thumbUrl: string | null;
        photoUrl: string | null;
      }[];
    };

// A legacy number written on a physical shoe isn't guaranteed unique — the
// same old number sometimes ends up on two genuinely different items
// (duplicate manual entry, or a number reused over time). When that
// happens, markItemSoldByShoeId can't tell which one just sold and silently
// skips both — "Sprzedano X z N" never updates and nobody notices. This
// lets the employee resolve it by eye instead: called only when the fast
// preloaded itemStatusByNumber map might be hiding a collision.
export async function checkItemsByLegacyNumber(legacyNumber: string): Promise<ItemsByLegacyNumberResult> {
  const access = await checkRole(...ALL_ROLES);
  if (!access.ok) return { ambiguous: false };

  const trimmed = legacyNumber.trim();
  if (!trimmed) return { ambiguous: false };

  const { data } = await supabaseAdmin
    .from("items")
    .select("id, internal_number, brand, model, status, batches(label)")
    .eq("legacy_number", trimmed)
    .is("deleted_at", null);

  const rows = data ?? [];
  if (rows.length <= 1) return { ambiguous: false };

  const candidates = await Promise.all(
    rows.map(async (row) => {
      const batches = row.batches as { label: string | null } | { label: string | null }[] | null;
      const batchLabel = Array.isArray(batches) ? (batches[0]?.label ?? null) : (batches?.label ?? null);

      const { data: photoRow } = await supabaseAdmin
        .from("item_photos")
        .select("storage_path")
        .eq("item_id", row.id)
        .eq("is_working_photo", true)
        .limit(1)
        .maybeSingle();

      let thumbUrl: string | null = null;
      let photoUrl: string | null = null;
      if (photoRow) {
        const [{ data: signedThumb }, { data: signedFull }] = await Promise.all([
          supabaseAdmin.storage
            .from("item-photos")
            .createSignedUrl(photoRow.storage_path, 300, {
              transform: { width: 128, height: 128, resize: "cover" },
            }),
          supabaseAdmin.storage.from("item-photos").createSignedUrl(photoRow.storage_path, 300),
        ]);
        thumbUrl = signedThumb?.signedUrl ?? null;
        photoUrl = signedFull?.signedUrl ?? null;
      }

      return {
        itemId: row.id,
        displayNumber: formatItemNumber(batchLabel, row.internal_number, trimmed),
        brand: row.brand,
        model: row.model,
        status: row.status,
        thumbUrl,
        photoUrl,
      };
    })
  );

  return { ambiguous: true, candidates };
}

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
    await Promise.all(
      parsed.items.map((item) => markItemSoldByShoeId(item.shoeId, item.itemId))
    );
  } else {
    await markItemSoldByShoeId(parsed.legacyShoeId, parsed.resolvedItemId);
  }

  after(async () => {
    const shoeIds = parsed.items?.length
      ? parsed.items.map((i) => i.shoeId).filter(Boolean).join(", ")
      : parsed.legacyShoeId;
    const lines = [
      "🛍 <b>Nowa sprzedaż</b>",
      `Platforma: ${parsed.platform}`,
      parsed.brand ? `Marka: ${parsed.brand}` : null,
      shoeIds ? `Numer: ${shoeIds}` : null,
      `Cena: ${formatPln(parsed.salePrice)}`,
      parsed.accountName ? `Konto: ${parsed.accountName}` : null,
      !confirmed ? "⏳ Czeka na zatwierdzenie" : null,
    ].filter(Boolean);
    await sendTelegramMessage(lines.join("\n"));
  });

  redirect("/sales");
}
