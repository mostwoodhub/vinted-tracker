"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  buttonSuccessClass,
  cardClass,
  errorTextClass,
  mutedTextClass,
} from "@/lib/ui-classes";
import { renderPdfFirstPageToCanvas } from "@/lib/pdf-to-image";

type Rect = { x: number; y: number; width: number; height: number };
type Stage = "ask-count" | "loading" | "crop" | "error";
type Corner = "nw" | "ne" | "sw" | "se";

const DISPLAY_MAX_WIDTH = 560;
const DISPLAY_MAX_HEIGHT = 440;
const MIN_SIZE = 24;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Nie udało się wczytać obrazu"));
    img.src = url;
  });
}

function defaultRect(width: number, height: number): Rect {
  return {
    x: Math.round(width * 0.05),
    y: Math.round(height * 0.05),
    width: Math.round(width * 0.9),
    height: Math.round(height * 0.9),
  };
}

export function LabelCropModal({
  file,
  onCancel,
  onDone,
}: {
  file: File;
  onCancel: () => void;
  onDone: (files: File[]) => void;
}) {
  const [stage, setStage] = useState<Stage>("ask-count");
  const [labelCount, setLabelCount] = useState<1 | 2>(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [collected, setCollected] = useState<File[]>([]);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dragState = useRef<{
    mode: "move" | "resize";
    corner?: Corner;
    startX: number;
    startY: number;
    startRect: Rect;
  } | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (stage !== "loading") return;
    let cancelled = false;

    async function prepareSource() {
      try {
        let url: string;
        let width: number;
        let height: number;

        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

        if (isPdf) {
          const buffer = await file.arrayBuffer();
          const canvas = await renderPdfFirstPageToCanvas(buffer);
          url = canvas.toDataURL("image/png");
          width = canvas.width;
          height = canvas.height;
        } else {
          url = URL.createObjectURL(file);
          objectUrlRef.current = url;
          const img = await loadImage(url);
          width = img.naturalWidth;
          height = img.naturalHeight;
        }

        if (cancelled) return;

        const scale = Math.min(DISPLAY_MAX_WIDTH / width, DISPLAY_MAX_HEIGHT / height, 1);
        const dispW = Math.max(1, Math.round(width * scale));
        const dispH = Math.max(1, Math.round(height * scale));

        setSourceUrl(url);
        setNaturalSize({ width, height });
        setDisplaySize({ width: dispW, height: dispH });
        setRect(defaultRect(dispW, dispH));
        setStage("crop");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Nie udało się wczytać pliku");
          setStage("error");
        }
      }
    }

    prepareSource();
    return () => {
      cancelled = true;
    };
  }, [stage, file]);

  function startCropping(count: 1 | 2) {
    setLabelCount(count);
    setStage("loading");
  }

  function onRectPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.preventDefault();
    if (!rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { mode: "move", startX: e.clientX, startY: e.clientY, startRect: rect };
  }

  function onHandlePointerDown(corner: Corner) {
    return (e: ReactPointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();
      if (!rect) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragState.current = { mode: "resize", corner, startX: e.clientX, startY: e.clientY, startRect: rect };
    };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag || !displaySize) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (drag.mode === "move") {
      const nx = clamp(drag.startRect.x + dx, 0, displaySize.width - drag.startRect.width);
      const ny = clamp(drag.startRect.y + dy, 0, displaySize.height - drag.startRect.height);
      setRect({ ...drag.startRect, x: nx, y: ny });
      return;
    }

    let { x, y, width, height } = drag.startRect;
    const corner = drag.corner;
    if (corner?.includes("e")) {
      width = clamp(drag.startRect.width + dx, MIN_SIZE, displaySize.width - x);
    }
    if (corner?.includes("s")) {
      height = clamp(drag.startRect.height + dy, MIN_SIZE, displaySize.height - y);
    }
    if (corner?.includes("w")) {
      const newX = clamp(drag.startRect.x + dx, 0, drag.startRect.x + drag.startRect.width - MIN_SIZE);
      width = drag.startRect.width + (drag.startRect.x - newX);
      x = newX;
    }
    if (corner?.includes("n")) {
      const newY = clamp(drag.startRect.y + dy, 0, drag.startRect.y + drag.startRect.height - MIN_SIZE);
      height = drag.startRect.height + (drag.startRect.y - newY);
      y = newY;
    }
    setRect({ x, y, width, height });
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragState.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragState.current = null;
  }

  async function produceFile(useFullImage: boolean): Promise<File> {
    if (!naturalSize || !displaySize || !sourceUrl) throw new Error("Brak źródła obrazu");
    const scaleX = naturalSize.width / displaySize.width;
    const scaleY = naturalSize.height / displaySize.height;

    const cropNatural = useFullImage
      ? { x: 0, y: 0, width: naturalSize.width, height: naturalSize.height }
      : {
          x: Math.round((rect?.x ?? 0) * scaleX),
          y: Math.round((rect?.y ?? 0) * scaleY),
          width: Math.round((rect?.width ?? naturalSize.width) * scaleX),
          height: Math.round((rect?.height ?? naturalSize.height) * scaleY),
        };

    const img = await loadImage(sourceUrl);
    let canvas = document.createElement("canvas");
    canvas.width = Math.max(1, cropNatural.width);
    canvas.height = Math.max(1, cropNatural.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas nie jest obsługiwany w tej przeglądarce");
    ctx.drawImage(
      img,
      cropNatural.x,
      cropNatural.y,
      cropNatural.width,
      cropNatural.height,
      0,
      0,
      cropNatural.width,
      cropNatural.height
    );

    // The print card (150x100mm) is landscape — if the saved crop came out
    // portrait, rotate it 90° so it fills the card instead of being
    // letterboxed tiny by object-fit: contain.
    if (canvas.height > canvas.width) {
      const rotated = document.createElement("canvas");
      rotated.width = canvas.height;
      rotated.height = canvas.width;
      const rctx = rotated.getContext("2d");
      if (rctx) {
        rctx.translate(rotated.width / 2, rotated.height / 2);
        rctx.rotate(Math.PI / 2);
        rctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
        canvas = rotated;
      }
    }

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Nie udało się zapisać pliku");

    const suffix = labelCount > 1 ? `-${currentIndex + 1}` : "";
    return new File([blob], `etykieta${suffix}.png`, { type: "image/png" });
  }

  async function advance(useFullImage: boolean) {
    setBusy(true);
    try {
      const f = await produceFile(useFullImage);
      const next = [...collected, f];
      if (currentIndex + 1 < labelCount) {
        setCollected(next);
        setCurrentIndex((i) => i + 1);
        if (displaySize) setRect(defaultRect(displaySize.width, displaySize.height));
      } else {
        onDone(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się przetworzyć pliku");
      setStage("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`flex w-full max-w-xl flex-col gap-4 ${cardClass}`}>
        {stage === "ask-count" && (
          <>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Ile etykiet na pliku?</h2>
            <p className={`text-sm ${mutedTextClass}`}>
              Vinted czasem generuje podwójne etykiety na jednym arkuszu — wybierz odpowiednią opcję.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => startCropping(1)} className={buttonPrimaryClass}>
                Jedna etykieta
              </button>
              <button type="button" onClick={() => startCropping(2)} className={buttonSecondaryClass}>
                Dwie etykiety
              </button>
            </div>
            <div>
              <button type="button" onClick={onCancel} className={buttonSecondaryClass}>
                Anuluj
              </button>
            </div>
          </>
        )}

        {stage === "loading" && (
          <p className={`text-sm ${mutedTextClass}`}>Wczytywanie pliku…</p>
        )}

        {stage === "error" && (
          <>
            <p className={errorTextClass}>{error}</p>
            <div>
              <button type="button" onClick={onCancel} className={buttonSecondaryClass}>
                Zamknij
              </button>
            </div>
          </>
        )}

        {stage === "crop" && displaySize && rect && sourceUrl && (
          <>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              {labelCount > 1 ? `Etykieta ${currentIndex + 1} z ${labelCount}` : "Kadrowanie etykiety"}
            </h2>
            <p className={`text-sm ${mutedTextClass}`}>
              Przesuń i zmień rozmiar ramki, aby wybrać fragment etykiety do zapisania.
            </p>
            <div
              className="relative touch-none select-none overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-bg)]"
              style={{ width: displaySize.width, height: displaySize.height }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sourceUrl}
                alt=""
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full"
                style={{ width: displaySize.width, height: displaySize.height }}
              />
              <div
                onPointerDown={onRectPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                className="absolute cursor-move border-2 border-[var(--color-accent)] bg-[var(--color-accent)]/20"
                style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
              >
                {(["nw", "ne", "sw", "se"] as Corner[]).map((corner) => (
                  <div
                    key={corner}
                    onPointerDown={onHandlePointerDown(corner)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    className="absolute h-4 w-4 rounded-full border-2 border-[var(--color-accent)] bg-[var(--color-surface)]"
                    style={{
                      cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize",
                      left: corner.includes("w") ? -8 : undefined,
                      right: corner.includes("e") ? -8 : undefined,
                      top: corner.includes("n") ? -8 : undefined,
                      bottom: corner.includes("s") ? -8 : undefined,
                    }}
                  />
                ))}
              </div>
            </div>

            {error && <p className={errorTextClass}>{error}</p>}

            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={onCancel} className={buttonSecondaryClass}>
                Anuluj
              </button>
              <button type="button" disabled={busy} onClick={() => advance(true)} className={buttonPrimaryClass}>
                Zapisz cały plik
              </button>
              <button type="button" disabled={busy} onClick={() => advance(false)} className={buttonSuccessClass}>
                ✓ Przytnij i zapisz
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
