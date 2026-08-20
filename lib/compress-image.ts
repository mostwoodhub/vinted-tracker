"use client";

// Working photos come straight off a phone camera (5-12MB each) with zero
// resizing anywhere in the pipeline, and a few of them together blow past
// the Server Action body limit (next.config.ts) before our own code ever
// runs — the framework rejects the request with a bare "Bad Request" that
// has no useful message to show. Downscaling client-side avoids that
// category of failure regardless of how many/how large the originals are.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Unsupported/corrupt image data — fall back to the original rather
    // than blocking the whole intake flow on a decode failure.
    return file;
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob || blob.size >= file.size) return file;

  const newName = `${file.name.replace(/\.[^./]+$/, "")}.jpg`;
  return new File([blob], newName, { type: "image/jpeg", lastModified: file.lastModified });
}

export async function compressImages(files: File[]): Promise<File[]> {
  return Promise.all(files.map(compressImage));
}
