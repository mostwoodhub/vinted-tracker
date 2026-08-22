"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRole } from "@/lib/auth";
import { getNextPhotoSortOrder } from "@/lib/item-photos";

// Final ("listing") photos are grouped into sets — e.g. shot on different
// backgrounds — so the same shoes can be posted on several accounts of the
// same platform without using visually identical photos everywhere (which
// gets flagged as a duplicate listing). Each set can optionally be earmarked
// for one specific selling account from the Konta list.

export type PhotoSetState = {
  status: "idle" | "success" | "error";
  error?: string;
};

export async function createPhotoSet(
  _prevState: PhotoSetState,
  formData: FormData
): Promise<PhotoSetState> {
  const access = await checkRole("photographer", "admin");
  if (!access.ok) return { status: "error", error: access.error };

  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!itemId) return { status: "error", error: "Brak identyfikatora towaru" };

  const label = String(formData.get("label") ?? "").trim();
  const accountName = String(formData.get("accountName") ?? "").trim();

  const { data: maxRow } = await supabaseAdmin
    .from("item_photo_sets")
    .select("sort_order")
    .eq("item_id", itemId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (maxRow?.sort_order ?? 0) + 1;

  const { error } = await supabaseAdmin.from("item_photo_sets").insert({
    item_id: itemId,
    label: label || null,
    account_name: accountName || null,
    sort_order: nextSortOrder,
  });

  if (error) return { status: "error", error: error.message };

  revalidatePath(`/items/${itemId}`);
  return { status: "success" };
}

export async function uploadPhotosToSet(
  _prevState: PhotoSetState,
  formData: FormData
): Promise<PhotoSetState> {
  const access = await checkRole("photographer", "admin");
  if (!access.ok) return { status: "error", error: access.error };

  const itemId = String(formData.get("itemId") ?? "").trim();
  const photoSetId = String(formData.get("photoSetId") ?? "").trim();
  if (!itemId) return { status: "error", error: "Brak identyfikatora towaru" };
  if (!photoSetId) return { status: "error", error: "Brak identyfikatora zestawu" };

  const photos = formData
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (photos.length === 0) {
    return { status: "error", error: "Wybierz co najmniej jedno zdjęcie" };
  }

  let nextSortOrder = await getNextPhotoSortOrder(itemId, false);
  for (const photo of photos) {
    const extension = photo.name.includes(".")
      ? photo.name.slice(photo.name.lastIndexOf("."))
      : "";
    const path = `${itemId}/${randomUUID()}${extension}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("item-photos")
      .upload(path, photo, { contentType: photo.type || undefined });

    if (uploadError) return { status: "error", error: uploadError.message };

    const { error: photoRowError } = await supabaseAdmin.from("item_photos").insert({
      item_id: itemId,
      storage_path: path,
      is_working_photo: false,
      photo_set_id: photoSetId,
      sort_order: nextSortOrder++,
    });

    if (photoRowError) return { status: "error", error: photoRowError.message };
  }

  revalidatePath(`/items/${itemId}`);
  return { status: "success" };
}

export async function deletePhotoSet(
  _prevState: PhotoSetState,
  formData: FormData
): Promise<PhotoSetState> {
  const access = await checkRole("photographer", "admin");
  if (!access.ok) return { status: "error", error: access.error };

  const itemId = String(formData.get("itemId") ?? "").trim();
  const photoSetId = String(formData.get("photoSetId") ?? "").trim();
  if (!itemId) return { status: "error", error: "Brak identyfikatora towaru" };
  if (!photoSetId) return { status: "error", error: "Brak identyfikatora zestawu" };

  const { data: photos } = await supabaseAdmin
    .from("item_photos")
    .select("storage_path")
    .eq("photo_set_id", photoSetId);

  const paths = (photos ?? []).map((p) => p.storage_path);
  if (paths.length > 0) {
    await supabaseAdmin.storage.from("item-photos").remove(paths);
  }

  // Deleting the set cascades to its item_photos rows (FK on delete cascade).
  const { error } = await supabaseAdmin
    .from("item_photo_sets")
    .delete()
    .eq("id", photoSetId);

  if (error) return { status: "error", error: error.message };

  revalidatePath(`/items/${itemId}`);
  return { status: "success" };
}
