import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatItemNumber } from "@/lib/item-number";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { StatusTrack } from "./StatusTrack";
import { FinalPhotosUpload } from "./FinalPhotosUpload";
import { WorkingPhotosUpload } from "./WorkingPhotosUpload";
import { PhotoSetsManager, type PhotoSetData, type PhotoSetPhoto } from "./PhotoSetsManager";
import { EditItemForm } from "./EditItemForm";
import { DeleteItemButton } from "./DeleteItemButton";
import { BackButton } from "./BackButton";
import { PhotoGrid } from "./PhotoGrid";
import { RetryAiCardButton } from "./RetryAiCardButton";
import { ApplyAiPriceButton } from "./ApplyAiPriceButton";
import { ReturnItemForm } from "./ReturnItemForm";
import { ListingsEditor, PLATFORM_LABELS } from "@/app/drafts/ListingsEditor";
import { mapListingsForEditor } from "@/lib/listing-publications";
import { formatPln } from "@/lib/format";
import {
  headingClass,
  mutedTextClass,
  noticeWarningClass,
  pageWrapClass,
} from "@/lib/ui-classes";

const AI_CARD_READY_OR_LATER = [
  "ai_card_ready",
  "ready_to_publish",
  "published",
  "sold",
];

const RETRY_THRESHOLD_MS = 15_000;

type ItemPhoto = {
  id: string;
  storage_path: string;
  is_working_photo: boolean;
};

type ItemPhotoWithSet = ItemPhoto & { photo_set_id: string | null };

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className={`text-xs ${mutedTextClass}`}>{label}</dt>
      <dd className="font-medium text-[var(--color-text)]">{value}</dd>
    </div>
  );
}

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // None of these depend on each other's result — only on the route `id`,
  // already known — so fire them together instead of one after another.
  const [{ data: item }, employee, { data: photos }, { data: photoSetsRaw }, { data: accountRows }] =
    await Promise.all([
      supabaseAdmin
        .from("items")
        .select(
          "*, batches(label), marketplace_listings(id, platform, title, description, status, listing_publications(id, account_name, photo_set_id, removed_at, olx_advert_id, olx_url, olx_status, allegro_offer_id, allegro_url, allegro_status))"
        )
        .eq("id", id)
        .single(),
      getCurrentEmployee(),
      supabaseAdmin
        .from("item_photos")
        .select("id, storage_path, is_working_photo, photo_set_id")
        .eq("item_id", id)
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("item_photo_sets")
        .select("id, label, account_name, sort_order")
        .eq("item_id", id)
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("sales_accounts_archive")
        .select("name")
        .order("sort_order", { ascending: true }),
    ]);

  if (!item) notFound();

  const listingsForEditor = mapListingsForEditor(item.marketplace_listings);

  const activePublications = listingsForEditor.flatMap((l) =>
    l.publications.map((p) => ({ platform: l.platform, accountName: p.accountName }))
  );

  const roles = getEffectiveRoles(employee);
  const canEdit = roles.has("admin") || roles.has("publisher");

  const photoRows = (photos ?? []) as ItemPhotoWithSet[];

  const paths = photoRows.map((photo) => photo.storage_path);
  const signedUrlByPath = new Map<string, string>();

  if (paths.length > 0) {
    const { data: signed } = await supabaseAdmin.storage
      .from("item-photos")
      .createSignedUrls(paths, 60 * 60);

    for (const entry of signed ?? []) {
      if (entry.signedUrl) signedUrlByPath.set(entry.path ?? "", entry.signedUrl);
    }
  }

  const workingPhotos = photoRows.filter((p) => p.is_working_photo);
  // Final photos with no set are the "classic" simple flow (pre-dates photo
  // sets, or someone who doesn't need multiple accounts/backgrounds).
  const finalPhotos = photoRows.filter((p) => !p.is_working_photo && !p.photo_set_id);

  const photoSets: PhotoSetData[] = (photoSetsRaw ?? []).map((s) => ({
    id: s.id,
    label: s.label,
    accountName: s.account_name,
  }));

  const photosBySet = new Map<string, PhotoSetPhoto[]>();
  for (const photo of photoRows) {
    if (photo.is_working_photo || !photo.photo_set_id) continue;
    const url = signedUrlByPath.get(photo.storage_path);
    if (!url) continue;
    const list = photosBySet.get(photo.photo_set_id) ?? [];
    list.push({ id: photo.id, url });
    photosBySet.set(photo.photo_set_id, list);
  }

  const accountNames = (accountRows ?? []).map((a) => a.name).filter(Boolean) as string[];

  const showListingsEditor = AI_CARD_READY_OR_LATER.includes(item.status);

  let legacyNumberMatches: {
    id: string;
    sale_date: string | null;
    platform: string | null;
    sale_price: number | null;
  }[] = [];

  if (item.legacy_number) {
    const { data: matches } = await supabaseAdmin
      .from("sales")
      .select("id, sale_date, platform, sale_price")
      .eq("legacy_shoe_id", item.legacy_number)
      .is("deleted_at", null);

    legacyNumberMatches = matches ?? [];
  }

  let showRetryAiCard = false;
  if (item.status === "photos_uploaded" && item.marketplace_listings.length === 0) {
    const { data: statusLog } = await supabaseAdmin
      .from("item_status_log")
      .select("changed_at")
      .eq("item_id", id)
      .eq("to_status", "photos_uploaded")
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (statusLog) {
      // This is a Server Component (no "use client") — it renders once per
      // request on the server, not repeatedly on the client, so Date.now()
      // here isn't subject to the client re-render purity concerns the
      // react-hooks/purity rule is meant to catch.
      // eslint-disable-next-line react-hooks/purity
      const elapsed = Date.now() - new Date(statusLog.changed_at).getTime();
      showRetryAiCard = elapsed > RETRY_THRESHOLD_MS;
    }
  }

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-[var(--space-xl)] px-6 py-12">
        <BackButton />
        <h1 className={headingClass}>
          Towar {formatItemNumber(item.batches?.label, item.internal_number, item.legacy_number)}
        </h1>

        <StatusTrack status={item.status} />

        {legacyNumberMatches.length > 0 && (
          <div className={noticeWarningClass}>
            <p className="font-medium">
              ⚠️ Stary numer &bdquo;{item.legacy_number}&rdquo; był już sprzedany w
              starym systemie
            </p>
            <ul className="flex flex-col gap-1">
              {legacyNumberMatches.map((sale) => (
                <li key={sale.id}>
                  {sale.sale_date ?? "—"}
                  {sale.platform ? ` · ${sale.platform}` : ""}
                  {sale.sale_price != null ? ` · ${formatPln(sale.sale_price)}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {workingPhotos.length === 0 && (
          <div className={noticeWarningClass}>
            <p className="font-medium">
              ⚠️ Brak zdjęcia roboczego —{" "}
              <a href="#working-photos" className="underline">
                dodaj zdjęcie
              </a>
              , żeby AI mogło zaproponować model i wstępną cenę.
            </p>
          </div>
        )}

        {showRetryAiCard && <RetryAiCardButton itemId={item.id} />}

        {item.status === "published" && <ReturnItemForm itemId={item.id} />}

        {item.status === "sold" && activePublications.length > 0 && (
          <div className={noticeWarningClass}>
            <p className="font-medium">
              ⚠️ Towar sprzedany, a wciąż oznaczony jako opublikowany na:
            </p>
            <ul className="flex flex-col gap-1">
              {activePublications.map((p, i) => (
                <li key={i}>
                  {PLATFORM_LABELS[p.platform] ?? p.platform} — {p.accountName}
                </li>
              ))}
            </ul>
            <p className={`text-xs ${mutedTextClass}`}>
              Pamiętaj usunąć ogłoszenie na tych kontach, a potem oznacz to niżej
              w sekcji &bdquo;Opublikowano na kontach&rdquo;.
            </p>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="Marka" value={item.brand ?? "—"} />
          <Field label="Model" value={item.model ?? "—"} />
          <Field label="Rozmiar" value={item.size ?? "—"} />
          <Field label="Partia" value={item.batches?.label ?? "—"} />
          <Field label="Stary numer" value={item.legacy_number ?? "—"} />
          <Field label="Stan" value={item.condition ?? "—"} />
          <Field label="Szczegół stanu" value={item.condition_detail ?? "—"} />
          <Field
            label="Wady"
            value={item.defects?.length ? item.defects.join(", ") : "Brak"}
          />
          <Field
            label="Cena"
            value={item.price != null ? `${item.price} zł` : "—"}
          />
          {item.ai_suggested_price != null && (
            <Field
              label="Sugerowana cena AI"
              value={
                <div className="flex flex-col gap-1">
                  <span>{formatPln(item.ai_suggested_price)}</span>
                  {item.ai_price_reasoning && (
                    <span className={`text-xs font-normal ${mutedTextClass}`}>
                      {item.ai_price_reasoning}
                    </span>
                  )}
                  <ApplyAiPriceButton itemId={item.id} />
                </div>
              }
            />
          )}
        </dl>

        <div className="grid grid-cols-1 gap-[var(--space-xl)] sm:grid-cols-2">
          <div id="working-photos" className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-[var(--color-text)]">
              Zdjęcia robocze (z przyjęcia)
            </h2>
            <PhotoGrid
              photos={workingPhotos}
              signedUrlByPath={Object.fromEntries(signedUrlByPath)}
              emptyText="Brak zdjęć roboczych."
              itemId={item.id}
            />
            <WorkingPhotosUpload itemId={item.id} />
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-[var(--color-text)]">
              Zdjęcia finalne
            </h2>
            <PhotoGrid
              photos={finalPhotos}
              signedUrlByPath={Object.fromEntries(signedUrlByPath)}
              emptyText="Brak zdjęć finalnych."
              itemId={item.id}
            />
            <FinalPhotosUpload itemId={item.id} />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium text-[var(--color-text)]">
              Zestawy zdjęć na konta
            </h2>
            <p className={`text-xs ${mutedTextClass}`}>
              Osobne zdjęcia (np. inne tło) dla każdego konta, żeby ta sama para
              butów nie wyglądała identycznie na kilku ogłoszeniach naraz.
            </p>
          </div>
          <PhotoSetsManager
            itemId={item.id}
            accountNames={accountNames}
            sets={photoSets}
            photosBySet={photosBySet}
          />
        </div>

        {showListingsEditor && (
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              Szkice ogłoszeń AI
            </h2>
            <ListingsEditor
              item={{ id: item.id, price: item.price, marketplace_listings: listingsForEditor }}
              accountNames={accountNames}
              photoSets={photoSets.map((s) => ({ id: s.id, label: s.label }))}
            />
          </div>
        )}

        {canEdit && (
          <EditItemForm
            itemId={item.id}
            brand={item.brand}
            model={item.model}
            size={item.size}
            condition={item.condition}
            conditionDetail={item.condition_detail}
            defects={item.defects ?? []}
            price={item.price}
            batchLabel={item.batches?.label ?? null}
            legacyNumber={item.legacy_number}
          />
        )}

        {roles.has("admin") && (
          <DeleteItemButton
            itemId={item.id}
            label={formatItemNumber(item.batches?.label, item.internal_number, item.legacy_number)}
          />
        )}
      </div>
    </div>
  );
}
