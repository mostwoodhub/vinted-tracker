import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Shared by both AI evaluation stages (quick intake estimate + thorough
// pre-publish card) since both need to hand real image bytes to the model.
export async function downloadPhotoAsBase64(path: string) {
  const { data, error } = await supabaseAdmin.storage
    .from("item-photos")
    .download(path);

  if (error || !data) {
    throw error ?? new Error(`Nie udało się pobrać zdjęcia: ${path}`);
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const mediaType = data.type || "image/jpeg";

  return { mediaType, base64: buffer.toString("base64") };
}
