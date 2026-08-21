"use server";

import { randomUUID } from "crypto";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRole } from "@/lib/auth";
import { resolveBatchId, deriveBatchLabelFromLegacyNumber } from "@/lib/batches";
import { CONDITIONS, CONDITION_DETAIL_OPTIONS } from "@/lib/condition-options";
import { formatItemNumber } from "@/lib/item-number";
import { generateIntakeEstimate } from "@/lib/ai-price-estimate";

export type IntakeState = {
  status: "idle" | "success" | "error" | "duplicate";
  internalNumber?: string | number;
  legacyNumber?: string;
  batchLabel?: string;
  brand?: string;
  size?: string;
  defectsSummary?: string;
  error?: string;
};

export type LegacyNumberCheckResult =
  | { exists: false }
  | {
      exists: true;
      itemId: string;
      displayNumber: string;
      brand: string | null;
      model: string | null;
      status: string;
      thumbUrl: string | null;
      photoUrl: string | null;
    };

// Live, as-you-type lookup — lets the employee see *what* is already under
// that number (with a photo, if there is one) before they finish filling
// out the rest of the form, instead of only finding out from a warning
// after they hit Zapisz. The submit-time check in createItem stays as the
// actual safety net (race conditions, JS disabled, etc.) — this is purely
// informational.
export async function checkLegacyNumber(legacyNumber: string): Promise<LegacyNumberCheckResult> {
  const access = await checkRole("intake", "admin");
  if (!access.ok) return { exists: false };

  const trimmed = legacyNumber.trim();
  if (!trimmed) return { exists: false };

  const { data } = await supabaseAdmin
    .from("items")
    .select("id, internal_number, brand, model, status, batches(label)")
    .eq("legacy_number", trimmed)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (!data) return { exists: false };

  const batches = data.batches as { label: string | null } | { label: string | null }[] | null;
  const batchLabel = Array.isArray(batches) ? (batches[0]?.label ?? null) : (batches?.label ?? null);

  const { data: photoRow } = await supabaseAdmin
    .from("item_photos")
    .select("storage_path")
    .eq("item_id", data.id)
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
    exists: true,
    itemId: data.id,
    displayNumber: formatItemNumber(batchLabel, data.internal_number, trimmed),
    brand: data.brand,
    model: data.model,
    status: data.status,
    thumbUrl,
    photoUrl,
  };
}

export async function createItem(
  _prevState: IntakeState,
  formData: FormData
): Promise<IntakeState> {
  const access = await checkRole("intake", "admin");
  if (!access.ok) return { status: "error", error: access.error };

  const brand = String(formData.get("brand") ?? "").trim();
  const size = String(formData.get("size") ?? "").trim();
  const insoleLength = String(formData.get("insoleLength") ?? "").trim();
  let batchLabel = String(formData.get("batchLabel") ?? "").trim();
  const condition = String(formData.get("condition") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const legacyNumber = String(formData.get("legacyNumber") ?? "").trim();
  const confirmDuplicate = String(formData.get("confirmDuplicate") ?? "") === "true";
  const customDefect = String(formData.get("customDefect") ?? "").trim();
  const defects = formData.getAll("defects").map(String);
  if (customDefect) defects.push(customDefect);
  const photos = formData
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (!brand) return { status: "error", error: "Podaj markę" };
  if (!size) return { status: "error", error: "Podaj rozmiar" };

  let conditionValue: string | null = condition || null;
  let conditionDetail: string | null = null;

  if (condition) {
    if (!CONDITIONS.includes(condition)) {
      return { status: "error", error: "Nieprawidłowy stan butów" };
    }

    const submittedDetail = String(formData.get("conditionDetail") ?? "").trim();
    const validOptions = CONDITION_DETAIL_OPTIONS[condition] ?? [];
    conditionDetail = validOptions.includes(submittedDetail)
      ? submittedDetail
      : null;
  } else {
    conditionValue = null;
  }

  let price: number | null = null;
  if (priceRaw) {
    price = Number(priceRaw.replace(",", "."));
    if (Number.isNaN(price)) {
      return { status: "error", error: "Nieprawidłowa cena" };
    }
  }

  // No Partia typed by hand, but the old number's letters name the batch
  // (e.g. "R15950" → batch "R") — derive it instead of leaving it blank.
  if (!batchLabel) {
    batchLabel = deriveBatchLabelFromLegacyNumber(legacyNumber) ?? "";
  }

  try {
    const batchId = await resolveBatchId(batchLabel);

    // Duplicate-number safety net: someone re-entering the same physical
    // shoe (or a label typo colliding with an existing one) is easy to miss
    // by eye. This only warns — it never blocks — since a genuine duplicate
    // pair (two identical shoes with the same old number written on them)
    // is a real, valid case too.
    if (legacyNumber && !confirmDuplicate) {
      const { data: existingRaw } = await supabaseAdmin
        .from("items")
        .select("internal_number, brand, model, batches(label)")
        .eq("legacy_number", legacyNumber)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();

      const existing = existingRaw as unknown as {
        internal_number: number;
        brand: string | null;
        model: string | null;
        batches: { label: string | null } | { label: string | null }[] | null;
      } | null;

      if (existing) {
        const existingBatchLabel = Array.isArray(existing.batches)
          ? existing.batches[0]?.label ?? null
          : existing.batches?.label ?? null;
        return {
          status: "duplicate",
          error: `Towar ze starym numerem „${legacyNumber}” już jest w magazynie: ${formatItemNumber(existingBatchLabel, existing.internal_number, legacyNumber)} · ${existing.brand ?? "—"} ${existing.model ?? ""}`.trim(),
        };
      }
    }

    const { data: item, error } = await supabaseAdmin
      .from("items")
      .insert({
        brand,
        size,
        insole_length: insoleLength || null,
        batch_id: batchId,
        condition: conditionValue,
        condition_detail: conditionDetail,
        defects,
        price,
        note: note || null,
        legacy_number: legacyNumber || null,
        created_by: access.employee.id,
      })
      .select("id, internal_number")
      .single();

    if (error) {
      return { status: "error", error: error.message };
    }

    // Baseline log entry so "how long has this sat without progress" can be
    // computed later — items intaken before this existed simply won't have
    // one, and staleness tracking treats that as "unknown" rather than 0.
    await supabaseAdmin.from("item_status_log").insert({
      item_id: item.id,
      from_status: null,
      to_status: "received",
      changed_by: access.employee.id,
    });

    for (const photo of photos) {
      const extension = photo.name.includes(".")
        ? photo.name.slice(photo.name.lastIndexOf("."))
        : "";
      const path = `${item.id}/${randomUUID()}${extension}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from("item-photos")
        .upload(path, photo, {
          contentType: photo.type || undefined,
        });

      if (uploadError) {
        return { status: "error", error: uploadError.message };
      }

      const { error: photoRowError } = await supabaseAdmin
        .from("item_photos")
        .insert({ item_id: item.id, storage_path: path, is_working_photo: true });

      if (photoRowError) {
        return { status: "error", error: photoRowError.message };
      }
    }

    // Fire-and-forget quick AI price/model estimate off the working
    // photo(s) just uploaded — never blocks the intake form response.
    if (photos.length > 0) {
      after(async () => {
        try {
          await generateIntakeEstimate(item.id);
        } catch (err) {
          console.error("Wstępna wycena AI nie powiodła się", err);
        }
      });
    }

    return {
      status: "success",
      internalNumber: item.internal_number,
      legacyNumber: legacyNumber || undefined,
      batchLabel: batchLabel || undefined,
      brand,
      size,
      defectsSummary: defects.length ? defects.join(", ") : undefined,
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Nieznany błąd",
    };
  }
}
