"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRole } from "@/lib/auth";
import { resolveBatchId, deriveBatchLabelFromLegacyNumber } from "@/lib/batches";
import { CONDITIONS, CONDITION_DETAIL_OPTIONS } from "@/lib/condition-options";
import { generateAiCard } from "./ai-card";

export type FinalPhotosState = {
  status: "idle" | "success" | "error";
  error?: string;
};

export async function uploadFinalPhotos(
  _prevState: FinalPhotosState,
  formData: FormData
): Promise<FinalPhotosState> {
  const access = await checkRole("photographer", "admin");
  if (!access.ok) return { status: "error", error: access.error };

  const itemId = String(formData.get("itemId") ?? "").trim();
  const photos = formData
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (!itemId) return { status: "error", error: "Brak identyfikatora towaru" };
  if (photos.length === 0) {
    return { status: "error", error: "Wybierz co najmniej jedno zdjęcie" };
  }

  for (const photo of photos) {
    const extension = photo.name.includes(".")
      ? photo.name.slice(photo.name.lastIndexOf("."))
      : "";
    const path = `${itemId}/${randomUUID()}${extension}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("item-photos")
      .upload(path, photo, { contentType: photo.type || undefined });

    if (uploadError) return { status: "error", error: uploadError.message };

    const { error: photoRowError } = await supabaseAdmin
      .from("item_photos")
      .insert({ item_id: itemId, storage_path: path, is_working_photo: false });

    if (photoRowError) return { status: "error", error: photoRowError.message };
  }

  const { data: item, error: itemError } = await supabaseAdmin
    .from("items")
    .select("status")
    .eq("id", itemId)
    .single();

  if (itemError) return { status: "error", error: itemError.message };

  if (item.status === "received") {
    const { error: statusError } = await supabaseAdmin
      .from("items")
      .update({ status: "photos_uploaded" })
      .eq("id", itemId);

    if (statusError) return { status: "error", error: statusError.message };

    await supabaseAdmin.from("item_status_log").insert({
      item_id: itemId,
      from_status: "received",
      to_status: "photos_uploaded",
      changed_by: access.employee.id,
    });

    after(async () => {
      try {
        await generateAiCard(itemId);
      } catch (err) {
        console.error("Generowanie karty AI nie powiodło się", err);
      }
    });
  }

  revalidatePath(`/items/${itemId}`);

  return { status: "success" };
}

export type WorkingPhotosState = {
  status: "idle" | "success" | "error";
  error?: string;
};

export async function uploadWorkingPhotos(
  _prevState: WorkingPhotosState,
  formData: FormData
): Promise<WorkingPhotosState> {
  const access = await checkRole("photographer", "intake", "admin");
  if (!access.ok) return { status: "error", error: access.error };

  const itemId = String(formData.get("itemId") ?? "").trim();
  const photos = formData
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (!itemId) return { status: "error", error: "Brak identyfikatora towaru" };
  if (photos.length === 0) {
    return { status: "error", error: "Wybierz co najmniej jedno zdjęcie" };
  }

  for (const photo of photos) {
    const extension = photo.name.includes(".")
      ? photo.name.slice(photo.name.lastIndexOf("."))
      : "";
    const path = `${itemId}/${randomUUID()}${extension}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("item-photos")
      .upload(path, photo, { contentType: photo.type || undefined });

    if (uploadError) return { status: "error", error: uploadError.message };

    const { error: photoRowError } = await supabaseAdmin
      .from("item_photos")
      .insert({ item_id: itemId, storage_path: path, is_working_photo: true });

    if (photoRowError) return { status: "error", error: photoRowError.message };
  }

  revalidatePath(`/items/${itemId}`);

  return { status: "success" };
}

export type EditItemState = {
  status: "idle" | "success" | "error";
  error?: string;
};

export async function updateItem(
  _prevState: EditItemState,
  formData: FormData
): Promise<EditItemState> {
  const access = await checkRole("admin", "publisher");
  if (!access.ok) return { status: "error", error: access.error };

  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!itemId) return { status: "error", error: "Brak identyfikatora towaru" };

  const brand = String(formData.get("brand") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const size = String(formData.get("size") ?? "").trim();
  let batchLabel = String(formData.get("batchLabel") ?? "").trim();
  const legacyNumber = String(formData.get("legacyNumber") ?? "").trim();
  const condition = String(formData.get("condition") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "").trim();
  const customDefect = String(formData.get("customDefect") ?? "").trim();
  const defects = formData.getAll("defects").map(String);
  if (customDefect) defects.push(customDefect);

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

    const { error } = await supabaseAdmin
      .from("items")
      .update({
        brand,
        model: model || null,
        size,
        batch_id: batchId,
        legacy_number: legacyNumber || null,
        condition: conditionValue,
        condition_detail: conditionDetail,
        defects,
        price,
      })
      .eq("id", itemId);

    if (error) return { status: "error", error: error.message };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Nieznany błąd",
    };
  }

  revalidatePath(`/items/${itemId}`);
  revalidatePath("/warehouse");

  return { status: "success" };
}

const RETURN_NEXT_STATUSES = ["ready_to_publish", "photos_uploaded"];

export type ReturnItemState = {
  status: "idle" | "success" | "error";
  error?: string;
};

export async function markAsReturned(
  _prevState: ReturnItemState,
  formData: FormData
): Promise<ReturnItemState> {
  const access = await checkRole("admin", "publisher");
  if (!access.ok) return { status: "error", error: access.error };

  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!itemId) return { status: "error", error: "Brak identyfikatora towaru" };

  const nextStatus = String(formData.get("nextStatus") ?? "").trim();
  if (!RETURN_NEXT_STATUSES.includes(nextStatus)) {
    return { status: "error", error: "Wybierz stan towaru po zwrocie" };
  }

  const refunded = formData.get("refunded") === "true";

  const { data: item, error: itemError } = await supabaseAdmin
    .from("items")
    .select("status")
    .eq("id", itemId)
    .single();

  if (itemError) return { status: "error", error: itemError.message };
  if (item.status !== "published") {
    return { status: "error", error: "Towar nie jest w statusie Opublikowano" };
  }

  const { error: returnedError } = await supabaseAdmin
    .from("items")
    .update({ status: "returned" })
    .eq("id", itemId);

  if (returnedError) return { status: "error", error: returnedError.message };

  const { error: returnedLogError } = await supabaseAdmin
    .from("item_status_log")
    .insert({
      item_id: itemId,
      from_status: "published",
      to_status: "returned",
      note: refunded
        ? "Zwrot środków klientowi: tak"
        : "Zwrot środków klientowi: nie",
    });

  if (returnedLogError) {
    return { status: "error", error: returnedLogError.message };
  }

  const { error: nextError } = await supabaseAdmin
    .from("items")
    .update({ status: nextStatus })
    .eq("id", itemId);

  if (nextError) return { status: "error", error: nextError.message };

  const { error: nextLogError } = await supabaseAdmin
    .from("item_status_log")
    .insert({
      item_id: itemId,
      from_status: "returned",
      to_status: nextStatus,
    });

  if (nextLogError) return { status: "error", error: nextLogError.message };

  revalidatePath(`/items/${itemId}`);
  revalidatePath("/warehouse");

  return { status: "success" };
}

export async function deleteItem(itemId: string) {
  const access = await checkRole("admin");
  if (!access.ok) throw new Error(access.error);

  const { error } = await supabaseAdmin
    .from("items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", itemId);

  if (error) throw new Error(error.message);

  revalidatePath(`/items/${itemId}`);
  revalidatePath("/warehouse");
}

// Copies the AI's suggested price (based on model/condition + this shop's
// own sales history for the brand — see lib/sales-history.ts) straight into
// the item's actual price field, one click instead of retyping it.
export async function applyAiSuggestedPrice(itemId: string) {
  const access = await checkRole("admin", "publisher");
  if (!access.ok) throw new Error(access.error);

  const { data: item, error: fetchError } = await supabaseAdmin
    .from("items")
    .select("ai_suggested_price")
    .eq("id", itemId)
    .single();

  if (fetchError) throw new Error(fetchError.message);
  if (item?.ai_suggested_price == null) throw new Error("Brak sugerowanej ceny AI");

  const { error } = await supabaseAdmin
    .from("items")
    .update({ price: item.ai_suggested_price })
    .eq("id", itemId);

  if (error) throw new Error(error.message);

  revalidatePath(`/items/${itemId}`);
  revalidatePath("/warehouse");
}

export type RetryAiCardState = {
  status: "idle" | "success" | "error";
  error?: string;
};

export async function retryAiCard(
  _prevState: RetryAiCardState,
  formData: FormData
): Promise<RetryAiCardState> {
  const access = await checkRole("photographer", "admin");
  if (!access.ok) return { status: "error", error: access.error };

  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!itemId) return { status: "error", error: "Brak identyfikatora towaru" };

  try {
    await generateAiCard(itemId);
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Nieznany błąd",
    };
  }

  revalidatePath(`/items/${itemId}`);

  return { status: "success" };
}
