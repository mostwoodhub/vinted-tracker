"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  saveDraftChanges,
  markReadyToPublish,
  addListingPublication,
  removeListingPublication,
  publishOlxAdvert,
  refreshOlxAdvertStatus,
  publishAllegroOffer,
  refreshAllegroOfferStatus,
  getAllegroCategoryOptions,
  type SaveDraftState,
  type PublishState,
  type PublicationActionState,
  type RefreshOlxState,
  type RefreshAllegroState,
} from "./actions";
import type { AllegroManualParam } from "@/lib/allegro-client";
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
  allegroOfferId: string | null;
  allegroUrl: string | null;
  allegroStatus: string | null;
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
const publishAllegroInitialState: PublicationActionState = { status: "idle" };
const refreshAllegroInitialState: RefreshAllegroState = { status: "idle" };

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

// Raw OLX status codes shown as short Polish labels instead of the API's
// own English/technical wording.
const OLX_STATUS_LABELS: Record<string, string> = {
  new: "Nowe (moderacja)",
  active: "Aktywne",
  limited: "Ograniczone",
  disabled: "Wyłączone",
  removed_by_user: "Usunięte",
  removed_by_moderator: "Usunięte (moderacja)",
  outdated: "Wygasłe",
  unconfirmed: "Niepotwierdzone",
  unpaid: "Nieopłacone",
  moderated: "W moderacji",
  blocked: "Zablokowane",
};

// Raw Allegro publication.status values shown as short Polish labels.
const ALLEGRO_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktywne",
  INACTIVE: "Nieaktywne",
  ENDED: "Zakończone",
  ENDING: "Kończy się",
};

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

  const rawStatus = state.status === "success" ? state.olxStatus : publication.olxStatus;
  const status = rawStatus ? OLX_STATUS_LABELS[rawStatus] ?? rawStatus : null;

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

// Mirrors OlxStatusBadge for the Allegro API publication path. Only
// rendered when the publication has an allegroOfferId (went through
// publishAllegroOffer, not a manual AddPublicationForm entry).
function AllegroStatusBadge({ publication }: { publication: Publication }) {
  const [state, dispatch, isPending] = useActionState(refreshAllegroOfferStatus, refreshAllegroInitialState);

  if (!publication.allegroOfferId) return null;

  const rawStatus = state.status === "success" ? state.allegroStatus : publication.allegroStatus;
  const status = rawStatus ? ALLEGRO_STATUS_LABELS[rawStatus] ?? rawStatus : null;

  function handleRefresh() {
    const formData = new FormData();
    formData.set("publicationId", publication.id);
    formData.set("allegroOfferId", String(publication.allegroOfferId));
    dispatch(formData);
  }

  return (
    <div className="flex items-center gap-1 text-xs">
      {publication.allegroUrl && (
        <a
          href={publication.allegroUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--color-accent)] underline"
        >
          {status ?? "sprawdź"}
        </a>
      )}
      {!publication.allegroUrl && <span className={mutedTextClass}>{status ?? "—"}</span>}
      <button
        type="button"
        onClick={handleRefresh}
        disabled={isPending}
        aria-label="Odśwież status Allegro"
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
  const [state, dispatch, isPending] = useActionState(
    removeListingPublication,
    removePublicationInitialState
  );

  // No <form> wrapper — same reason as OlxStatusBadge/PublishOlxApiForm:
  // this whole editor already lives inside one outer <form>, and a nested
  // one silently ate clicks after a hydration crash (verified live — Usuń
  // did nothing at all until this was fixed).
  function handleRemove() {
    const formData = new FormData();
    formData.set("itemId", itemId);
    formData.set("publicationId", publication.id);
    dispatch(formData);
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-1">
        <span className="text-xs text-[var(--color-text)]">
          ✅ {publication.accountName}
          {photoSetLabel ? ` · ${photoSetLabel}` : ""}
        </span>
        <div className="flex items-center gap-1">
          <OlxStatusBadge publication={publication} />
          <AllegroStatusBadge publication={publication} />
          <CopyDraftButton
            title={title}
            description={description}
            price={price}
            label={`Kopiuj (${publication.accountName})`}
            small
          />
          <button
            type="button"
            onClick={handleRemove}
            disabled={isPending}
            className="rounded-full bg-[var(--color-danger-bg)] px-2 py-0.5 text-xs font-medium text-[var(--color-danger)] transition-opacity hover:opacity-80"
          >
            {isPending ? "…" : "Usuń"}
          </button>
        </div>
      </div>
      {state.status === "error" && (
        <span className="text-xs text-[var(--color-danger)]">{state.error}</span>
      )}
    </div>
  );
}

// Publishing is per-platform *and* per-account, not all-or-nothing: the same
// draft might go live on Vinted under two different accounts (yours, a
// family member's) at once. Each posting is tracked separately here so it's
// obvious which accounts still need the listing pulled down after a sale.
// No <form> wrapper — see RemovePublicationForm's comment; same nested-form
// issue applies here.
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
  const [state, dispatch, isPending] = useActionState(
    addListingPublication,
    addPublicationInitialState
  );
  const [accountName, setAccountName] = useState("");
  const [photoSetId, setPhotoSetId] = useState("");

  if (accountNames.length === 0) {
    return (
      <p className={`text-xs ${mutedTextClass}`}>
        Brak kont — dodaj konto na stronie Konta, żeby móc oznaczyć publikację.
      </p>
    );
  }

  function handleAdd() {
    const formData = new FormData();
    formData.set("itemId", itemId);
    formData.set("listingId", listingId);
    formData.set("accountName", accountName);
    formData.set("photoSetId", photoSetId);
    dispatch(formData);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        <select
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          className={`${inputClass} text-xs`}
        >
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
        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending || !accountName}
          className={buttonPrimaryClass}
        >
          {isPending ? "Dodawanie…" : "+ Dodaj publikację"}
        </button>
      </div>
      {state.status === "error" && (
        <span className="text-xs text-[var(--color-danger)]">{state.error}</span>
      )}
    </div>
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
        <button
          type="button"
          onClick={handlePublish}
          disabled={isPending}
          className="flex min-h-10 w-full items-center justify-center rounded-full bg-[var(--color-accent)] px-4 py-2 text-center text-xs font-medium leading-tight text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Publikowanie…" : "🚀 Publikuj automatycznie"}
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

// Mirrors PublishOlxApiForm for Allegro — see publishAllegroOffer. Allegro's
// category schema varies a lot (Kolor/Materiał zewnętrzny on a sneaker,
// Zapięcie/Wysokość obcasa on a boot, ...) — whatever this listing's
// resolved category needs that this app has no matching item data for gets
// asked for here as a dynamic field, dropdown for a dictionary parameter,
// plain input otherwise, rather than the app guessing or hard-coding one
// field name at a time.
function PublishAllegroApiForm({
  itemId,
  listingId,
  photoSets,
}: {
  itemId: string;
  listingId: string;
  photoSets: PhotoSetOption[];
}) {
  const [state, dispatch, isPending] = useActionState(publishAllegroOffer, publishAllegroInitialState);
  const [photoSetId, setPhotoSetId] = useState("");
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [optionsStatus, setOptionsStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [manualParams, setManualParams] = useState<AllegroManualParam[]>([]);
  const [optionsError, setOptionsError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getAllegroCategoryOptions(listingId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setManualParams(result.manualParams);
        setOptionsStatus("loaded");
      } else {
        setOptionsError(result.error);
        setOptionsStatus("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  const allManualValuesFilled = manualParams.every((param) => manualValues[param.id]?.trim());

  function handlePublish() {
    const formData = new FormData();
    formData.set("itemId", itemId);
    formData.set("listingId", listingId);
    formData.set("photoSetId", photoSetId);
    formData.set("manualValues", JSON.stringify(manualValues));
    dispatch(formData);
  }

  return (
    <div className="flex flex-col gap-1">
      {optionsStatus === "loading" && (
        <span className={`text-xs ${mutedTextClass}`}>Ładowanie wymaganych pól Allegro…</span>
      )}
      {optionsStatus === "error" && (
        <span className="text-xs text-[var(--color-danger)]">
          Nie udało się pobrać wymaganych pól Allegro: {optionsError}
        </span>
      )}
      {optionsStatus === "loaded" && (
      <div className="flex flex-wrap items-center gap-1">
        {manualParams.map((param) =>
          param.options.length > 0 ? (
            <select
              key={param.id}
              value={manualValues[param.id] ?? ""}
              onChange={(e) => setManualValues((prev) => ({ ...prev, [param.id]: e.target.value }))}
              className={`${inputClass} text-xs`}
            >
              <option value="" disabled>
                {param.name}…
              </option>
              {param.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              key={param.id}
              type={param.type === "float" || param.type === "integer" ? "number" : "text"}
              value={manualValues[param.id] ?? ""}
              onChange={(e) => setManualValues((prev) => ({ ...prev, [param.id]: e.target.value }))}
              placeholder={param.unit ? `${param.name} (${param.unit})` : param.name}
              className={`${inputClass} text-xs`}
            />
          )
        )}
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
        <button
          type="button"
          onClick={handlePublish}
          disabled={isPending || !allManualValuesFilled}
          className="flex min-h-10 w-full items-center justify-center rounded-full bg-[var(--color-accent)] px-4 py-2 text-center text-xs font-medium leading-tight text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Publikowanie…" : "🚀 Publikuj automatycznie"}
        </button>
      </div>
      )}
      {state.status === "error" && (
        <span className="text-xs text-[var(--color-danger)]">{state.error}</span>
      )}
      {state.status === "success" && (
        <span className={`text-xs ${successTextClass}`}>Opublikowano na Allegro.</span>
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
  // Guards the same thing the server action now also checks — hiding the
  // button once it's already published is the first line of defense
  // against a second click creating a second live advert.
  const hasActiveOlxApiPublication = listing.publications.some(
    (p) => p.accountName === "OLX API"
  );
  const hasActiveAllegroApiPublication = listing.publications.some(
    (p) => p.accountName === "Allegro API"
  );

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
      {listing.platform === "olx" && !hasActiveOlxApiPublication && (
        <PublishOlxApiForm itemId={itemId} listingId={listing.id} photoSets={photoSets} />
      )}
      {listing.platform === "allegro" && !hasActiveAllegroApiPublication && (
        <PublishAllegroApiForm itemId={itemId} listingId={listing.id} photoSets={photoSets} />
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
