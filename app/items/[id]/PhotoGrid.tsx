"use client";

import { useState } from "react";
import { DownloadPhotoButton } from "@/app/DownloadPhotoButton";
import { mutedTextClass } from "@/lib/ui-classes";

type ItemPhoto = {
  id: string;
  storage_path: string;
};

export function PhotoGrid({
  photos,
  signedUrlByPath,
  emptyText,
}: {
  photos: ItemPhoto[];
  signedUrlByPath: Record<string, string>;
  emptyText: string;
}) {
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);

  if (photos.length === 0) {
    return <p className={`text-sm ${mutedTextClass}`}>{emptyText}</p>;
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((photo) => {
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
