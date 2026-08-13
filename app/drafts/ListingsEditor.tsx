"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  saveDraftChanges,
  markReadyToPublish,
  type SaveDraftState,
  type PublishState,
} from "./actions";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  cardSmClass,
  errorTextClass,
  inputClass,
  mutedTextClass,
  successTextClass,
} from "@/lib/ui-classes";

const PLATFORM_LABELS: Record<string, string> = {
  vinted: "Vinted",
  allegro: "Allegro",
  olx: "OLX",
};

const PLATFORM_LIMITS: Record<string, { title: number; description: number }> = {
  vinted: { title: 70, description: 1000 },
  allegro: { title: 50, description: 2000 },
  olx: { title: 70, description: 4000 },
};

const PLATFORM_ORDER = ["vinted", "allegro", "olx"];

export type Listing = {
  id: string;
  platform: string;
  title: string | null;
  description: string | null;
};

export type ListingsItem = {
  id: string;
  price: number | null;
  marketplace_listings: Listing[];
};

const saveInitialState: SaveDraftState = { status: "idle" };
const publishInitialState: PublishState = { status: "idle" };

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonPrimaryClass}>
      {pending ? "Zapisywanie…" : "Zapisz zmiany"}
    </button>
  );
}

function PublishButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonSecondaryClass}>
      {pending ? "Zapisywanie…" : "Gotowe do publikacji"}
    </button>
  );
}

export function ListingsEditor({ item }: { item: ListingsItem }) {
  const [saveState, saveAction] = useActionState(
    saveDraftChanges,
    saveInitialState
  );
  const [publishState, publishAction] = useActionState(
    markReadyToPublish,
    publishInitialState
  );

  const listingByPlatform = new Map(
    item.marketplace_listings.map((listing) => [listing.platform, listing])
  );

  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const platform of PLATFORM_ORDER) {
      const listing = listingByPlatform.get(platform);
      initial[`${platform}_title`] = listing?.title?.length ?? 0;
      initial[`${platform}_description`] = listing?.description?.length ?? 0;
    }
    return initial;
  });

  const handleCount =
    (key: string) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setCounts((prev) => ({ ...prev, [key]: event.target.value.length }));
    };

  return (
    <div className="flex flex-col gap-4">
      <form action={saveAction} className="flex flex-col gap-4">
        <input type="hidden" name="itemId" value={item.id} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PLATFORM_ORDER.map((platform) => {
            const listing = listingByPlatform.get(platform);
            const limits = PLATFORM_LIMITS[platform];

            if (!listing) {
              return (
                <div
                  key={platform}
                  className={`flex flex-col gap-2 ${cardSmClass}`}
                >
                  <h3 className="text-sm font-medium text-[var(--color-text)]">
                    {PLATFORM_LABELS[platform] ?? platform}
                  </h3>
                  <p className={`text-xs ${mutedTextClass}`}>
                    Brak szkicu.
                  </p>
                </div>
              );
            }

            const titleKey = `${platform}_title`;
            const descriptionKey = `${platform}_description`;

            return (
              <div
                key={platform}
                className={`flex flex-col gap-2 ${cardSmClass}`}
              >
                <h3 className="text-sm font-medium text-[var(--color-text)]">
                  {PLATFORM_LABELS[platform] ?? platform}
                </h3>
                <input
                  type="hidden"
                  name={`${platform}_listingId`}
                  value={listing.id}
                />

                <label className="flex flex-col gap-1">
                  <span className={`text-xs ${mutedTextClass}`}>
                    Tytuł ({counts[titleKey] ?? 0}/{limits.title} znaków)
                  </span>
                  <input
                    name={titleKey}
                    defaultValue={listing.title ?? ""}
                    onChange={handleCount(titleKey)}
                    className={inputClass}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className={`text-xs ${mutedTextClass}`}>
                    Opis ({counts[descriptionKey] ?? 0}/{limits.description}{" "}
                    znaków)
                  </span>
                  <textarea
                    name={descriptionKey}
                    defaultValue={listing.description ?? ""}
                    onChange={handleCount(descriptionKey)}
                    rows={8}
                    className={inputClass}
                  />
                </label>
              </div>
            );
          })}
        </div>

        <label className="flex max-w-xs flex-col gap-1">
          <span className={`text-xs ${mutedTextClass}`}>
            Cena (wspólna dla wszystkich platform)
          </span>
          <input
            name="price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={item.price ?? ""}
            className={inputClass}
          />
        </label>

        {saveState.status === "error" && (
          <p className={errorTextClass} role="alert">
            {saveState.error}
          </p>
        )}
        {saveState.status === "success" && (
          <p className={successTextClass}>
            Zapisano zmiany.
          </p>
        )}

        <SaveButton />
      </form>

      <form action={publishAction} className="flex flex-col gap-2">
        <input type="hidden" name="itemId" value={item.id} />

        {publishState.status === "error" && (
          <p className={errorTextClass} role="alert">
            {publishState.error}
          </p>
        )}

        <PublishButton />
      </form>
    </div>
  );
}
