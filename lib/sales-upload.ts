import "server-only";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function uploadSaleFile(file: File): Promise<{ url: string; filename: string }> {
  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const filename = `${randomUUID()}${extension}`;

  const { error } = await supabaseAdmin.storage
    .from("sale-photos")
    .upload(filename, file, { contentType: file.type || undefined });

  if (error) throw new Error(error.message);

  const { data } = supabaseAdmin.storage.from("sale-photos").getPublicUrl(filename);
  return { url: data.publicUrl, filename };
}

export async function uploadSalePhotos(files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const { url } = await uploadSaleFile(file);
    urls.push(url);
  }
  return urls;
}
