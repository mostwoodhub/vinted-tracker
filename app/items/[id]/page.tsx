import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatItemNumber } from "@/lib/item-number";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { StatusTrack } from "./StatusTrack";
import { FinalPhotosUpload } from "./FinalPhotosUpload";
import { WorkingPhotosUpload } from "./WorkingPhotosUpload";
import { EditItemForm } from "./EditItemForm";
import { RetryAiCardButton } from "./RetryAiCardButton";
import { ReturnItemForm } from "./ReturnItemForm";
import { ListingsEditor } from "@/app/drafts/ListingsEditor";
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

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className={`text-xs ${mutedTextClass}`}>{label}</dt>
      <dd className="font-medium text-[var(--color-text)]">{value}</dd>
    </div>
  );
}

function PhotoGrid({
  photos,
  signedUrlByPath,
  emptyText,
}: {
  photos: ItemPhoto[];
  signedUrlByPath: Map<string, string>;
  emptyText: string;
}) {
  if (photos.length === 0) {
    return <p className={`text-sm ${mutedTextClass}`}>{emptyText}</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photos.map((photo) => {
        const url = signedUrlByPath.get(photo.storage_path);
        if (!url) return null;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={photo.id}
            src={url}
            alt=""
            className="aspect-square w-full rounded-[var(--radius-sm)] object-cover"
          />
        );
      })}
    </div>
  );
}

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: item } = await supabaseAdmin
    .from("items")
    .select(
      "*, batches(label), marketplace_listings(id, platform, title, description)"
    )
    .eq("id", id)
    .single();

  if (!item) notFound();

  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);
  const canEdit = roles.has("admin") || roles.has("publisher");

  const { data: photos } = await supabaseAdmin
    .from("item_photos")
    .select("id, storage_path, is_working_photo")
    .eq("item_id", id)
    .order("uploaded_at", { ascending: true });

  const paths = (photos ?? []).map((photo) => photo.storage_path);
  const signedUrlByPath = new Map<string, string>();

  if (paths.length > 0) {
    const { data: signed } = await supabaseAdmin.storage
      .from("item-photos")
      .createSignedUrls(paths, 60 * 60);

    for (const entry of signed ?? []) {
      if (entry.signedUrl) signedUrlByPath.set(entry.path ?? "", entry.signedUrl);
    }
  }

  const workingPhotos = (photos ?? []).filter((p) => p.is_working_photo);
  const finalPhotos = (photos ?? []).filter((p) => !p.is_working_photo);

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
      const elapsed = Date.now() - new Date(statusLog.changed_at).getTime();
      showRetryAiCard = elapsed > RETRY_THRESHOLD_MS;
    }
  }

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-[var(--space-xl)] px-6 py-12">
        <h1 className={headingClass}>
          Towar {formatItemNumber(item.batches?.label, item.internal_number)}
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

        {showRetryAiCard && <RetryAiCardButton itemId={item.id} />}

        {item.status === "published" && <ReturnItemForm itemId={item.id} />}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="Marka" value={item.brand ?? "—"} />
          <Field label="Model" value={item.model ?? "—"} />
          <Field label="Rozmiar" value={item.size ?? "—"} />
          <Field label="Partia" value={item.batches?.label ?? "—"} />
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
        </dl>

        <div className="grid grid-cols-1 gap-[var(--space-xl)] sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-[var(--color-text)]">
              Zdjęcia robocze (z przyjęcia)
            </h2>
            <PhotoGrid
              photos={workingPhotos}
              signedUrlByPath={signedUrlByPath}
              emptyText="Brak zdjęć roboczych."
            />
            <WorkingPhotosUpload itemId={item.id} />
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-[var(--color-text)]">
              Zdjęcia finalne
            </h2>
            <PhotoGrid
              photos={finalPhotos}
              signedUrlByPath={signedUrlByPath}
              emptyText="Brak zdjęć finalnych."
            />
            <FinalPhotosUpload itemId={item.id} />
          </div>
        </div>

        {showListingsEditor && (
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              Szkice ogłoszeń AI
            </h2>
            <ListingsEditor item={item} />
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
          />
        )}
      </div>
    </div>
  );
}
