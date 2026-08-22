"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DownloadPhotoButton } from "@/app/DownloadPhotoButton";
import { reorderItemPhotos } from "./actions";
import { mutedTextClass } from "@/lib/ui-classes";

type ItemPhoto = {
  id: string;
  storage_path: string;
};

// Pointer Events instead of HTML5 drag-and-drop — HTML5 DnD doesn't fire at
// all on touch devices, and this app's photo work happens mostly on
// employees' phones. Pointer events unify mouse/touch/pen in one model, so
// the same handler drags on both. A dedicated handle (not the photo itself)
// avoids fighting the image's own click-to-zoom.
export function PhotoGrid({
  photos,
  signedUrlByPath,
  emptyText,
  itemId,
}: {
  photos: ItemPhoto[];
  signedUrlByPath: Record<string, string>;
  emptyText: string;
  // Reorder handles only render when passed — some callers (e.g. a photo
  // set's own sub-grid) don't want them.
  itemId?: string;
}) {
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);
  const [order, setOrder] = useState(photos);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const containerRefs = useRef(new Map<string, HTMLDivElement>());
  const draggingIdRef = useRef<string | null>(null);

  // Server data (a fresh upload, another viewer's edit) always wins over
  // whatever's mid-drag locally — not mirroring a prop for its own sake.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrder(photos);
  }, [photos]);

  if (photos.length === 0) {
    return <p className={`text-sm ${mutedTextClass}`}>{emptyText}</p>;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>, photoId: string) {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingIdRef.current = photoId;
    setDraggingId(photoId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const dragId = draggingIdRef.current;
    if (!dragId) return;
    const x = e.clientX;
    const y = e.clientY;
    let overId: string | null = null;
    for (const [id, el] of containerRefs.current) {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        overId = id;
        break;
      }
    }
    if (overId && overId !== dragId) {
      setOrder((prev) => {
        const fromIndex = prev.findIndex((p) => p.id === dragId);
        const toIndex = prev.findIndex((p) => p.id === overId);
        if (fromIndex === -1 || toIndex === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      });
    }
  }

  function handlePointerUp() {
    draggingIdRef.current = null;
    setDraggingId(null);
    if (!itemId) return;
    const photoIds = order.map((p) => p.id);
    startTransition(async () => {
      try {
        await reorderItemPhotos(itemId, photoIds);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Nie udało się zmienić kolejności");
      }
    });
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {order.map((photo) => {
          const url = signedUrlByPath[photo.storage_path];
          if (!url) return null;
          return (
            <div
              key={photo.id}
              ref={(el) => {
                if (el) containerRefs.current.set(photo.id, el);
                else containerRefs.current.delete(photo.id);
              }}
              className={`relative ${draggingId === photo.id ? "opacity-50" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                onClick={() => setZoomedUrl(url)}
                className="aspect-square w-full cursor-zoom-in rounded-[var(--radius-sm)] object-cover transition-opacity hover:opacity-80"
              />
              {itemId && (
                <button
                  type="button"
                  onPointerDown={(e) => handlePointerDown(e, photo.id)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  aria-label="Przeciągnij, aby zmienić kolejność"
                  style={{ touchAction: "none" }}
                  className="absolute left-1 top-1 flex h-6 w-6 cursor-grab items-center justify-center rounded-full bg-black/60 text-sm text-white active:cursor-grabbing"
                >
                  ⠿
                </button>
              )}
              <div className="absolute bottom-1 right-1">
                <DownloadPhotoButton url={url} filename={`${photo.id}.jpg`} />
              </div>
            </div>
          );
        })}
      </div>

      {zoomedUrl && (
        <div
          onClick={() => setZoomedUrl(null)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-6"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomedUrl}
            alt=""
            onClick={() => setZoomedUrl(null)}
            className="max-h-full max-w-full rounded-[var(--radius-md)] object-contain"
          />
        </div>
      )}
    </>
  );
}
