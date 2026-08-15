"use client";

import { useState } from "react";

// Signed Supabase Storage URLs are cross-origin, so a plain <a download> gets
// ignored by most browsers (they just navigate instead of saving). Fetching
// the image as a blob and downloading that local object URL works around it.
export function DownloadPhotoButton({
  url,
  filename,
  className,
}: {
  url: string;
  filename: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      alert("Nie udało się pobrać zdjęcia.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title="Pobierz zdjęcie"
      className={
        className ??
        "rounded-full bg-black/60 px-1.5 py-0.5 text-xs text-white hover:bg-black/80 disabled:opacity-60"
      }
    >
      {pending ? "…" : "💾"}
    </button>
  );
}
