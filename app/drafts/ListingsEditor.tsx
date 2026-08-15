"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  saveDraftChanges,
  markReadyToPublish,
  addListingPublication,
  removeListingPublication,
  type SaveDraftState,
  type PublishState,
  type PublicationActionState,
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

export const PLATFORM_LABELS: Record<string, string> = {
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

export type Publication = {
  id: string;
  accountName: string;
  photoSetId: string | null;
};

export type Listing = {
  id: string;
  platform: string;
  title: string | null;
  description: string | null;
  status: string | null;
  publications: Publication[];
};

export type PhotoSetOption = {
  id: string;
  label: string | null;
};

export type ListingsItem = {
  id: string;
  price: number | null;
  marketplace_listings: Listing[];
};

const saveInitialState: SaveDraftState = { status: "idle" };
const publishInitialState: PublishState = { status: "idle" };
const addPublicationInitialState: PublicationActionState = { status: "idle" };
const removePublicationInitialState: PublicationActionState = { status: "idle" };

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

function buildCopyText({
  title,
  description,
  price,
}: {
  title: string;
  description: string;
  price: number | null;
}) {
  const priceLine = price != null ? `Cena: ${price} zł` : "";
  return [title, "", description, priceLine].filter((line) => line !== "").join("\n");
}

function CopyDraftButton({
  title,
  description,
  price,
  label,
  small = false,
}: {
  title: string;
  description: string;
  price: number | null;
  label: string;
  small?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    const text = buildCopyText({ title, description, price });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("Nie udało się skopiować — zaznacz i skopiuj ręcznie.");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        small
          ? "rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--color-text)] transition-opacity hover:opacity-80"
          : `${buttonSecondaryClass}`
      }
    >
      {copied ? "✅ Skopiowano" : `📋 ${label}`}
    </button>
  );
}

function RemovePublicationButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-[var(--color-danger-bg)] px-2 py-0.5 text-xs font-medium text-[var(--color-danger)] transition-opacity hover:opacity-80"
    >
      {pending ? "…" : "Usuń"}
    </button>
  );
}

function RemovePublicationForm({
  itemId,
  publication,
  photoSetLabel,
  title,
  description,
  price,
}: {
  itemId: string;
  publication: Publication;
  photoSetLabel: string | null;
  title: string;
  description: string;
  price: number | null;
}) {
  const [state, action] = useActionState(
    removeListingPublication,
    removePublicationInitialState
  );

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-1">
        <span className="text-xs text-[var(--color-text)]">
          ✅ {publication.accountName}
          {photoSetLabel ? ` · ${photoSetLabel}` : ""}
        </span>
        <div className="flex items-center gap-1">
          <CopyDraftButton
            title={title}
            description={description}
            price={price}
            label={`Kopiuj (${publication.accountName})`}
            small
          />
          <form action={action}>
            <input type="hidden" name="itemId" value={itemId} />
            <input type="hidden" name="publicationId" value={publication.id} />
            <RemovePublicationButton />
          </form>
        </div>
      </div>
      {state.status === "error" && (
        <span className="text-xs text-[var(--color-danger)]">{state.error}</span>
      )}
    </div>
  );
}

function AddPublicationButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonPrimaryClass}>
      {pending ? "Dodawanie…" : "+ Dodaj publikację"}
    </button>
  );
}

// Publishing is per-platform *and* per-account, not all-or-nothing: the same
// draft might go live on Vinted under two different accounts (yours, a
// family member's) at once. Each posting is tracked separately here so it's
// obvious which accounts still need the listing pulled down after a sale.
function AddPublicationForm({
  itemId,
  listingId,
  accountNames,
  photoSets,
}: {
  itemId: string;
  listingId: string;
  accountNames: string[];
  photoSets: PhotoSetOption[];
}) {
  const [state, action] = useActionState(
    addListingPublication,
    addPublicationInitialState
  );

  if (accountNames.length === 0) {
    return (
      <p className={`text-xs ${mutedTextClass}`}>
        Brak kont — dodaj konto na stronie Konta, żeby móc oznaczyć publikację.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="listingId" value={listingId} />
      <div className="flex flex-wrap gap-1">
        <select name="accountName" defaultValue="" className={`${inputClass} text-xs`}>
          <option value="" disabled>
            Konto…
          </option>
          {accountNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {photoSets.length > 0 && (
          <select name="photoSetId" defaultValue="" className={`${inputClass} text-xs`}>
            <option value="">Bez zestawu zdjęć</option>
            {photoSets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.label || "Zestaw zdjęć"}
              </option>
            ))}
          </select>
        )}
        <AddPublicationButton />
      </div>
      {state.status === "error" && (
        <span className="text-xs text-[var(--color-danger)]">{state.error}</span>
      )}
    </form>
  );
}

function PlatformPublications({
  itemId,
  listing,
  accountNames,
  photoSets,
  price,
}: {
  itemId: string;
  listing: Listing;
  accountNames: string[];
  photoSets: PhotoSetOption[];
  price: number | null;
}) {
  const photoSetLabelById = new Map(photoSets.map((s) => [s.id, s.label]));

  return (
    <div className="flex flex-col gap-1.5">
      {listing.publications.map((publication) => (
        <RemovePublicationForm
          key={publication.id}
          itemId={itemId}
          publication={publication}
          photoSetLabel={
            publication.photoSetId
              ? photoSetLabelById.get(publication.photoSetId) ?? null
              : null
          }
          title={listing.title ?? ""}
          description={listing.description ?? ""}
          price={price}
        />
      ))}
      <AddPublicationForm
        itemId={itemId}
        listingId={listing.id}
        accountNames={accountNames}
        photoSets={photoSets}
      />
    </div>
  );
}

export function ListingsEditor({
  item,
  accountNames = [],
  photoSets = [],
}: {
  item: ListingsItem;
  accountNames?: string[];
  photoSets?: PhotoSetOption[];
}) {
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
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-[var(--color-text)]">
                    {PLATFORM_LABELS[platform] ?? platform}
                  </h3>
                  <CopyDraftButton
                    title={listing.title ?? ""}
                    description={listing.description ?? ""}
                    price={item.price}
                    label="Kopiuj"
                    small
                  />
                </div>
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

                <div className="flex flex-col gap-1">
                  <span className={`text-xs ${mutedTextClass}`}>
                    Opublikowano na kontach
                  </span>
                  <PlatformPublications
                    itemId={item.id}
                    listing={listing}
                    accountNames={accountNames}
                    photoSets={photoSets}
                    price={item.price}
                  />
                </div>
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
