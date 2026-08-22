"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  saveDraftChanges,
  markReadyToPublish,
  addListingPublication,
  removeListingPublication,
  publishOlxAdvert,
  refreshOlxAdvertStatus,
  type SaveDraftState,
  type PublishState,
  type PublicationActionState,
  type RefreshOlxState,
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
  olxAdvertId: number | null;
  olxUrl: string | null;
  olxStatus: string | null;
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
const publishOlxInitialState: PublicationActionState = { status: "idle" };
const refreshOlxInitialState: RefreshOlxState = { status: "idle" };

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

// Reconciliation for the one publication path that's a real API listing —
// see refreshOlxAdvertStatus. Only rendered when the publication actually
// has an olxAdvertId (i.e. it went through publishOlxAdvert, not a manual
// AddPublicationForm entry). Dispatches the action directly (no <form>
// wrapper) — this whole editor already lives inside one outer <form> (see
// ListingsEditor's saveAction), and HTML doesn't allow nested forms; a
// browser silently "flattens" that by closing the outer one early, which
// desyncs from what React server-rendered and crashes hydration. A plain
// button avoids adding to that pre-existing structural issue.
function OlxStatusBadge({ publication }: { publication: Publication }) {
  const [state, dispatch, isPending] = useActionState(refreshOlxAdvertStatus, refreshOlxInitialState);

  if (!publication.olxAdvertId) return null;

  const status = state.status === "success" ? state.olxStatus : publication.olxStatus;

  function handleRefresh() {
    const formData = new FormData();
    formData.set("publicationId", publication.id);
    formData.set("olxAdvertId", String(publication.olxAdvertId));
    dispatch(formData);
  }

  return (
    <div className="flex items-center gap-1 text-xs">
      {publication.olxUrl && (
        <a
          href={publication.olxUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--color-accent)] underline"
        >
          {status ?? "sprawdź"}
        </a>
      )}
      {!publication.olxUrl && <span className={mutedTextClass}>{status ?? "—"}</span>}
      {state.status === "success" && state.advertViews != null && (
        <span className={mutedTextClass}>· {state.advertViews} wyśw.</span>
      )}
      <button
        type="button"
        onClick={handleRefresh}
        disabled={isPending}
        aria-label="Odśwież status OLX"
        className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--color-text)] transition-opacity hover:opacity-80"
      >
        {isPending ? "…" : "🔄"}
      </button>
      {state.status === "error" && (
        <span className="text-[var(--color-danger)]">{state.error}</span>
      )}
    </div>
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
          <OlxStatusBadge publication={publication} />
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

// The one publication path that's a real API call instead of manual
// bookkeeping — see publishOlxAdvert. Kept separate from AddPublicationForm
// since it needs no account picker (always "OLX API") and can fail for API
// reasons (category/attribute mismatch, OLX rejecting the request) that a
// manual publication never can. Dispatches directly rather than wrapping a
// <form> — see the comment on OlxStatusBadge for why: this whole editor is
// already inside one outer <form>, and HTML forbids nesting another.
function PublishOlxApiForm({
  itemId,
  listingId,
  photoSets,
}: {
  itemId: string;
  listingId: string;
  photoSets: PhotoSetOption[];
}) {
  const [state, dispatch, isPending] = useActionState(publishOlxAdvert, publishOlxInitialState);
  const [photoSetId, setPhotoSetId] = useState("");

  function handlePublish() {
    const formData = new FormData();
    formData.set("itemId", itemId);
    formData.set("listingId", listingId);
    formData.set("photoSetId", photoSetId);
    dispatch(formData);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        {photoSets.length > 0 && (
          <select
            value={photoSetId}
            onChange={(e) => setPhotoSetId(e.target.value)}
            className={`${inputClass} text-xs`}
          >
            <option value="">Bez zestawu zdjęć</option>
            {photoSets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.label || "Zestaw zdjęć"}
              </option>
            ))}
          </select>
        )}
        <button type="button" onClick={handlePublish} disabled={isPending} className={buttonPrimaryClass}>
          {isPending ? "Publikowanie…" : "🚀 Publikuj automatycznie (OLX API)"}
        </button>
      </div>
      {state.status === "error" && (
        <span className="text-xs text-[var(--color-danger)]">{state.error}</span>
      )}
      {state.status === "success" && (
        <span className={`text-xs ${successTextClass}`}>Opublikowano na OLX.</span>
      )}
    </div>
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
      {listing.platform === "olx" && (
        <PublishOlxApiForm itemId={itemId} listingId={listing.id} photoSets={photoSets} />
      )}
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
