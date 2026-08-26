"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buttonPrimaryClass,
  cardClass,
  errorTextClass,
  inputClass,
  labelClass,
} from "@/lib/ui-classes";

const MAX_CROP_PERCENT = 45;

// Trims the same percentage off all four sides, then re-encodes as a blob
// in the source file's own mime type (falls back to jpeg for anything the
// canvas can't identify, e.g. some HEIC files) — the crop itself never
// leaves the browser, nothing is uploaded anywhere.
async function cropImageFile(file: File, cropPercent: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const cropX = Math.round(bitmap.width * (cropPercent / 100));
    const cropY = Math.round(bitmap.height * (cropPercent / 100));
    const width = bitmap.width - cropX * 2;
    const height = bitmap.height - cropY * 2;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");
    ctx.drawImage(bitmap, cropX, cropY, width, height, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type || "image/jpeg", 0.92)
    );
    if (!blob) throw new Error("toBlob failed");
    return blob;
  } finally {
    bitmap.close();
  }
}

export function PhotoCropTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [cropPercent, setCropPercent] = useState(5);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One object URL per file, only for the live crop-preview below — revoked
  // whenever the selection changes so we don't leak memory over repeated
  // uploads in the same session.
  const previewUrls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => {
    return () => previewUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [previewUrls]);

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files ?? []));
    setError(null);
  }

  async function handleSaveAll() {
    setPending(true);
    setError(null);
    try {
      for (let i = 0; i < files.length; i++) {
        const blob = await cropImageFile(files[i], cropPercent);
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = `cropped-${files[i].name}`;
        link.click();
        URL.revokeObjectURL(objectUrl);
        // Sequential with a short gap — firing several downloads at once
        // from one click can get silently dropped by the browser's
        // popup-blocker-style guard (same issue as the Vinted photo
        // downloader in ListingsEditor.tsx).
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch {
      setError("Nie udało się obrobić jednego lub więcej zdjęć.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`flex flex-col gap-4 ${cardClass}`}>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Zdjęcia</span>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFilesSelected}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5 max-w-xs">
        <span className={labelClass}>Przytnij krawędzie o (%)</span>
        <input
          type="number"
          min={0}
          max={MAX_CROP_PERCENT}
          step={1}
          value={cropPercent}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isNaN(v)) return;
            setCropPercent(Math.min(MAX_CROP_PERCENT, Math.max(0, v)));
          }}
          className={inputClass}
        />
      </label>

      {files.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {files.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="relative overflow-hidden rounded-lg bg-[var(--color-surface-2)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrls[i]} alt="" className="block h-auto w-full" />
              <div
                className="absolute inset-x-0 top-0 bg-black/50"
                style={{ height: `${cropPercent}%` }}
              />
              <div
                className="absolute inset-x-0 bottom-0 bg-black/50"
                style={{ height: `${cropPercent}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 bg-black/50"
                style={{ width: `${cropPercent}%` }}
              />
              <div
                className="absolute inset-y-0 right-0 bg-black/50"
                style={{ width: `${cropPercent}%` }}
              />
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className={errorTextClass} role="alert">
          {error}
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={handleSaveAll}
          disabled={pending || files.length === 0}
          className={buttonPrimaryClass}
        >
          {pending ? "Zapisywanie…" : `Zapisz wszystkie (${files.length})`}
        </button>
      </div>
    </div>
  );
}
