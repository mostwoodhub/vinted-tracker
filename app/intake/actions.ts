"use server";

import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRole } from "@/lib/auth";
import { resolveBatchId } from "@/lib/batches";
import { CONDITIONS, CONDITION_DETAIL_OPTIONS } from "@/lib/condition-options";
import { formatItemNumber } from "@/lib/item-number";

export type IntakeState = {
  status: "idle" | "success" | "error" | "duplicate";
  internalNumber?: string | number;
  batchLabel?: string;
  brand?: string;
  size?: string;
  defectsSummary?: string;
  error?: string;
};

export async function createItem(
  _prevState: IntakeState,
  formData: FormData
): Promise<IntakeState> {
  const access = await checkRole("intake", "admin");
  if (!access.ok) return { status: "error", error: access.error };

  const brand = String(formData.get("brand") ?? "").trim();
  const size = String(formData.get("size") ?? "").trim();
  const insoleLength = String(formData.get("insoleLength") ?? "").trim();
  const batchLabel = String(formData.get("batchLabel") ?? "").trim();
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
          error: `Towar ze starym numerem „${legacyNumber}” już jest w magazynie: ${formatItemNumber(existingBatchLabel, existing.internal_number)} · ${existing.brand ?? "—"} ${existing.model ?? ""}`.trim(),
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

    return {
      status: "success",
      internalNumber: item.internal_number,
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
