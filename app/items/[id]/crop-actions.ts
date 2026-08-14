"use server";

import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRole } from "@/lib/auth";

export type CropState = {
  status: "idle" | "success" | "error";
  error?: string;
};

// On-demand only (never runs automatically on upload — the user clicks the
// ✂️ button when they want it). Trims the uniform-color border around the
// product, typical of photos shot on a plain floor/background, using
// sharp's trim(). Overwrites the same storage object so nothing else
// (the item_photos row, already-issued signed URLs) needs to change.
export async function autoCropPhoto(
  _prevState: CropState,
  formData: FormData
): Promise<CropState> {
  const access = await checkRole("photographer", "admin");
  if (!access.ok) return { status: "error", error: access.error };

  const photoId = String(formData.get("photoId") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!photoId) return { status: "error", error: "Brak identyfikatora zdjęcia" };

  const { data: photo, error: photoError } = await supabaseAdmin
    .from("item_photos")
    .select("storage_path")
    .eq("id", photoId)
    .single();

  if (photoError) return { status: "error", error: photoError.message };

  const { data: file, error: downloadError } = await supabaseAdmin.storage
    .from("item-photos")
    .download(photo.storage_path);

  if (downloadError || !file) {
    return {
      status: "error",
      error: downloadError?.message ?? "Nie udało się pobrać zdjęcia",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "image/jpeg";

  let cropped: Buffer;
  try {
    cropped = await sharp(buffer).trim().toBuffer();
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Nie udało się przyciąć zdjęcia",
    };
  }

  const { error: uploadError } = await supabaseAdmin.storage
    .from("item-photos")
    .upload(photo.storage_path, cropped, { contentType, upsert: true });

  if (uploadError) return { status: "error", error: uploadError.message };

  if (itemId) revalidatePath(`/items/${itemId}`);

  return { status: "success" };
}
