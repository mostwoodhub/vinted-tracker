"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DownloadPhotoButton } from "@/app/DownloadPhotoButton";
import { moveItemPhoto } from "./actions";
import { mutedTextClass } from "@/lib/ui-classes";

type ItemPhoto = {
  id: string;
  storage_path: string;
};

// Arrow buttons over drag-and-drop on purpose — HTML5 native drag doesn't
// work on touch devices at all, and this app's photo work happens mostly on
// employees' phones (see the rest of this codebase's mobile-first history).
// A tap works identically everywhere.
function ReorderControls({
  itemId,
  photoId,
  canMoveEarlier,
  canMoveLater,
}: {
  itemId: string;
  photoId: string;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function move(direction: "earlier" | "later") {
    startTransition(async () => {
      try {
        await moveItemPhoto(itemId, photoId, direction);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Nie udało się zmienić kolejności");
      }
    });
  }

  return (
    <div className="absolute left-1 top-1 flex gap-0.5">
      <button
        type="button"
        disabled={!canMoveEarlier || isPending}
        onClick={() => move("earlier")}
        aria-label="Przesuń wcześniej"
        className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white disabled:opacity-30"
      >
        ‹
      </button>
      <button
        type="button"
        disabled={!canMoveLater || isPending}
        onClick={() => move("later")}
        aria-label="Przesuń później"
        className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white disabled:opacity-30"
      >
        ›
      </button>
    </div>
  );
}

export function PhotoGrid({
  photos,
  signedUrlByPath,
  emptyText,
  itemId,
}: {
  photos: ItemPhoto[];
  signedUrlByPath: Record<string, string>;
  emptyText: string;
  // Reorder controls only render when passed — some callers (e.g. a photo
  // set's own sub-grid) don't want them.
  itemId?: string;
}) {
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);

  if (photos.length === 0) {
    return <p className={`text-sm ${mutedTextClass}`}>{emptyText}</p>;
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((photo, index) => {
          const url = signedUrlByPath[photo.storage_path];
          if (!url) return null;
          return (
            <div key={photo.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                onClick={() => setZoomedUrl(url)}
                className="aspect-square w-full cursor-zoom-in rounded-[var(--radius-sm)] object-cover transition-opacity hover:opacity-80"
              />
              {itemId && (
                <ReorderControls
                  itemId={itemId}
                  photoId={photo.id}
                  canMoveEarlier={index > 0}
                  canMoveLater={index < photos.length - 1}
                />
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
