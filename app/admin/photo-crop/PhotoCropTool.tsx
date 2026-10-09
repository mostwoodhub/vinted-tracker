"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buttonPrimaryClass,
  cardClass,
  errorTextClass,
  inputClass,
  labelClass,
} from "@/lib/ui-classes";
import { rotationFillScale } from "@/lib/photo-rotate";

const MAX_CROP_PERCENT = 45;
const MAX_ANGLE = 15;

// Trims the same percentage off all four sides, then re-encodes as a blob
// in the source file's own mime type (falls back to jpeg for anything the
// canvas can't identify, e.g. some HEIC files) — the crop itself never
// leaves the browser, nothing is uploaded anywhere.
async function cropImageFile(file: File, cropPercent: number, angle: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    // Straighten first, on a same-size canvas (scaled up just enough that
    // no corner is left empty), then trim the edges off the result — the
    // live preview applies the same order, so what it shows is what's saved.
    let source: CanvasImageSource = bitmap;
    if (angle !== 0) {
      const tilted = document.createElement("canvas");
      tilted.width = bitmap.width;
      tilted.height = bitmap.height;
      const tctx = tilted.getContext("2d");
      if (!tctx) throw new Error("Canvas context unavailable");
      tctx.fillStyle = "#ffffff";
      tctx.fillRect(0, 0, tilted.width, tilted.height);
      tctx.translate(tilted.width / 2, tilted.height / 2);
      tctx.rotate((angle * Math.PI) / 180);
      const scale = rotationFillScale(bitmap.width, bitmap.height, angle);
      tctx.scale(scale, scale);
      tctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      source = tilted;
    }

    const cropX = Math.round(bitmap.width * (cropPercent / 100));
    const cropY = Math.round(bitmap.height * (cropPercent / 100));
    const width = bitmap.width - cropX * 2;
    const height = bitmap.height - cropY * 2;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");
    ctx.drawImage(source, cropX, cropY, width, height, 0, 0, width, height);
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
  // Per-photo straightening angle (degrees, + = clockwise) and each
  // preview's natural aspect (needed for the corner-fill zoom).
  const [angles, setAngles] = useState<number[]>([]);
  const [aspects, setAspects] = useState<Record<number, number>>({});
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
    const picked = Array.from(e.target.files ?? []);
    setFiles(picked);
    setAngles(picked.map(() => 0));
    setAspects({});
    setError(null);
  }

  async function handleSaveAll() {
    setPending(true);
    setError(null);
    try {
      const croppedFiles: File[] = [];
      for (let i = 0; i < files.length; i++) {
        const blob = await cropImageFile(files[i], cropPercent, angles[i] ?? 0);
        croppedFiles.push(new File([blob], `cropped-${files[i].name}`, { type: blob.type }));
      }

      // Mobile browsers — iOS Safari especially — handle a batch of
      // separate <a download> clicks unreliably: it often just opens each
      // photo in a new tab instead of saving it, and rapid successive
      // clicks are more likely to get dropped than on desktop. The native
      // share sheet's own "Save Image(s)" action is the reliable way to
      // land multiple photos in Photos/gallery there, so prefer it
      // whenever the browser can share files at all (desktop browsers
      // mostly can't, so this falls through to the download loop there).
      if (navigator.canShare?.({ files: croppedFiles })) {
        try {
          await navigator.share({ files: croppedFiles });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          // Any other share failure: fall through to the download loop.
        }
      }

      for (let i = 0; i < croppedFiles.length; i++) {
        const objectUrl = URL.createObjectURL(croppedFiles[i]);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = croppedFiles[i].name;
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
          {files.map((file, i) => {
            const angle = angles[i] ?? 0;
            const aspect = aspects[i];
            const scale = aspect ? rotationFillScale(aspect, 1, angle) : 1;
            const setAngle = (next: number) =>
              setAngles((prev) => {
                const copy = [...prev];
                copy[i] = Math.min(MAX_ANGLE, Math.max(-MAX_ANGLE, Math.round(next * 10) / 10));
                return copy;
              });
            return (
              <div key={`${file.name}-${i}`} className="flex flex-col gap-2">
                <div className="relative overflow-hidden rounded-lg bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrls[i]}
                    alt=""
                    className="block h-auto w-full"
                    style={{ transform: `rotate(${angle}deg) scale(${scale})`, transformOrigin: "center" }}
                    onLoad={(e) => {
                      const { naturalWidth, naturalHeight } = e.currentTarget;
                      setAspects((prev) => ({ ...prev, [i]: naturalWidth / naturalHeight }));
                    }}
                  />
                  <div className="absolute inset-x-0 top-0 bg-black/50" style={{ height: `${cropPercent}%` }} />
                  <div className="absolute inset-x-0 bottom-0 bg-black/50" style={{ height: `${cropPercent}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-black/50" style={{ width: `${cropPercent}%` }} />
                  <div className="absolute inset-y-0 right-0 bg-black/50" style={{ width: `${cropPercent}%` }} />
                </div>
                <div className="flex flex-col gap-1 text-xs">
                  <div className="flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAngle(angle - 1)}
                      className="rounded-full bg-[var(--color-surface-2)] px-2.5 py-1"
                      aria-label="Obróć w lewo o 1 stopień"
                    >
                      ↺ −1°
                    </button>
                    <button
                      type="button"
                      onClick={() => setAngle(0)}
                      disabled={angle === 0}
                      className="tabular-nums text-[var(--color-text-muted)] disabled:opacity-60"
                      aria-label="Resetuj obrót"
                    >
                      {angle > 0 ? "+" : ""}
                      {angle}°
                    </button>
                    <button
                      type="button"
                      onClick={() => setAngle(angle + 1)}
                      className="rounded-full bg-[var(--color-surface-2)] px-2.5 py-1"
                      aria-label="Obróć w prawo o 1 stopień"
                    >
                      +1° ↻
                    </button>
                  </div>
                  <input
                    type="range"
                    min={-MAX_ANGLE}
                    max={MAX_ANGLE}
                    step={0.5}
                    value={angle}
                    onChange={(e) => setAngle(Number(e.target.value))}
                    className="w-full"
                    aria-label="Kąt obrotu"
                  />
                </div>
              </div>
            );
          })}
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
