"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRole } from "@/lib/auth";
import { resolveListingPhotoRows, prepareListingPhotoUrls } from "@/lib/item-photos";
import {
  getOlxToken,
  suggestOlxCategory,
  getOlxCategoryAttributes,
  getOlxCategoryPhotosLimit,
  buildOlxAttributes,
  createOlxAdvert,
  getOlxAdvert,
  getOlxAdvertStatistics,
  deactivateOlxAdvert,
} from "@/lib/olx-client";
import {
  getAllegroToken,
  suggestAllegroCategory,
  getAllegroCategoryParameters,
  getAllegroManualParams,
  buildAllegroParameters,
  uploadAllegroImage,
  createAllegroOffer,
  getAllegroOffer,
  endAllegroOffer,
  ALLEGRO_MAX_PHOTOS,
  type AllegroManualParam,
} from "@/lib/allegro-client";

const PLATFORMS = ["vinted", "allegro", "olx"];

export type SaveDraftState = {
  status: "idle" | "success" | "error";
  error?: string;
};

export async function saveDraftChanges(
  _prevState: SaveDraftState,
  formData: FormData
): Promise<SaveDraftState> {
  const access = await checkRole("publisher", "admin");
  if (!access.ok) return { status: "error", error: access.error };

  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!itemId) return { status: "error", error: "Brak identyfikatora towaru" };

  const priceRaw = String(formData.get("price") ?? "").trim();
  let price: number | null = null;
  if (priceRaw) {
    price = Number(priceRaw.replace(",", "."));
    if (Number.isNaN(price)) {
      return { status: "error", error: "Nieprawidłowa cena" };
    }
  }

  for (const platform of PLATFORMS) {
    const listingId = String(formData.get(`${platform}_listingId`) ?? "").trim();
    if (!listingId) continue;

    const title = String(formData.get(`${platform}_title`) ?? "").trim();
    const description = String(
      formData.get(`${platform}_description`) ?? ""
    ).trim();

    let selectedPhotoIds: string[] | null = null;
    const photoIdsRaw = formData.get(`${platform}_photoIds`);
    if (typeof photoIdsRaw === "string" && photoIdsRaw) {
      try {
        const parsed = JSON.parse(photoIdsRaw);
        if (Array.isArray(parsed) && parsed.length > 0) selectedPhotoIds = parsed;
      } catch {
        // Malformed client-side JSON shouldn't block saving title/description.
      }
    }

    const { error } = await supabaseAdmin
      .from("marketplace_listings")
      .update({ title, description, selected_photo_ids: selectedPhotoIds })
      .eq("id", listingId);

    if (error) return { status: "error", error: error.message };
  }

  const { error: priceError } = await supabaseAdmin
    .from("items")
    .update({ price })
    .eq("id", itemId);

  if (priceError) return { status: "error", error: priceError.message };

  revalidatePath("/drafts");

  return { status: "success" };
}

export type PublicationActionState = {
  status: "idle" | "success" | "error";
  error?: string;
};

// Items are marked "ready_to_publish" as a whole (all three draft cards
// finished), but which platforms actually go live — and under which of your
// several accounts (yours, wife's, son's, ...) — is decided one at a time.
// The same Vinted draft might get posted under two different accounts; each
// posting is its own row here so you can tell them apart and remember to
// pull the listing down from every account it's on once the item sells. The
// item's own pipeline status only advances to "published" the first time
// *any* publication is added, and is never pulled back down if one is
// removed later (the item may still be live elsewhere).
const ADVANCEABLE_ITEM_STATUSES = ["ai_card_ready", "ready_to_publish"];

export async function addListingPublication(
  _prevState: PublicationActionState,
  formData: FormData
): Promise<PublicationActionState> {
  const access = await checkRole("publisher", "admin");
  if (!access.ok) return { status: "error", error: access.error };

  const listingId = String(formData.get("listingId") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();
  const accountName = String(formData.get("accountName") ?? "").trim();
  const photoSetId = String(formData.get("photoSetId") ?? "").trim();

  if (!listingId) return { status: "error", error: "Brak identyfikatora ogłoszenia" };
  if (!itemId) return { status: "error", error: "Brak identyfikatora towaru" };
  if (!accountName) return { status: "error", error: "Wybierz konto" };

  const { error: insertError } = await supabaseAdmin.from("listing_publications").insert({
    listing_id: listingId,
    item_id: itemId,
    account_name: accountName,
    photo_set_id: photoSetId || null,
  });

  if (insertError) return { status: "error", error: insertError.message };

  const { data: item, error: itemError } = await supabaseAdmin
    .from("items")
    .select("status")
    .eq("id", itemId)
    .single();

  if (itemError) return { status: "error", error: itemError.message };

  if (ADVANCEABLE_ITEM_STATUSES.includes(item.status)) {
    const { error: statusError } = await supabaseAdmin
      .from("items")
      .update({ status: "published" })
      .eq("id", itemId);
    if (statusError) return { status: "error", error: statusError.message };

    await supabaseAdmin.from("item_status_log").insert({
      item_id: itemId,
      from_status: item.status,
      to_status: "published",
    });
  }

  revalidatePath("/drafts");
  revalidatePath(`/items/${itemId}`);
  revalidatePath("/warehouse");
  revalidatePath("/dashboard");

  return { status: "success" };
}

// Real listing, not bookkeeping: this is the one publication path that
// actually calls out to OLX and creates a live advert, instead of just
// recording that an employee posted it by hand elsewhere. Always filed
// under a dedicated "OLX API" account so it's visually distinct from
// manual OLX postings in the same list.
export async function publishOlxAdvert(
  _prevState: PublicationActionState,
  formData: FormData
): Promise<PublicationActionState> {
  const access = await checkRole("publisher", "admin");
  if (!access.ok) return { status: "error", error: access.error };

  const listingId = String(formData.get("listingId") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();
  const photoSetId = String(formData.get("photoSetId") ?? "").trim();
  const whiteBackground = formData.get("whiteBackground") === "true";
  const cropTop = formData.get("cropTop") === "true";

  if (!listingId) return { status: "error", error: "Brak identyfikatora ogłoszenia" };
  if (!itemId) return { status: "error", error: "Brak identyfikatora towaru" };

  const [{ data: listing }, { data: item }] = await Promise.all([
    supabaseAdmin
      .from("marketplace_listings")
      .select("title, description, selected_photo_ids")
      .eq("id", listingId)
      .single(),
    supabaseAdmin
      .from("items")
      .select("brand, size, condition, price, status")
      .eq("id", itemId)
      .single(),
  ]);

  if (!listing) return { status: "error", error: "Nie znaleziono ogłoszenia" };
  if (!item) return { status: "error", error: "Nie znaleziono towaru" };
  if (!item.price) return { status: "error", error: "Towar nie ma ustawionej ceny" };

  // Nothing in the UI used to stop a second click from creating a second
  // live advert for the same listing — verified live: two clicks a few
  // seconds apart made two real OLX adverts, both of which OLX itself then
  // flagged "disabled" as duplicates.
  const { data: existing } = await supabaseAdmin
    .from("listing_publications")
    .select("id")
    .eq("listing_id", listingId)
    .eq("account_name", "OLX API")
    .is("removed_at", null)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { status: "error", error: "To ogłoszenie jest już opublikowane przez OLX API." };
  }

  const photoRows = await resolveListingPhotoRows(itemId, photoSetId || null, listing.selected_photo_ids);

  if (!photoRows || photoRows.length === 0) {
    return { status: "error", error: "Brak zdjęć finalnych do opublikowania" };
  }

  const auth = await getOlxToken();
  if (!auth.ok) return { status: "error", error: auth.error };

  const category = await suggestOlxCategory(auth.accessToken, listing.title ?? "");
  if (!category.ok) return { status: "error", error: category.error };

  const [categoryAttrs, photosLimit] = await Promise.all([
    getOlxCategoryAttributes(auth.accessToken, category.data),
    getOlxCategoryPhotosLimit(auth.accessToken, category.data),
  ]);
  if (!categoryAttrs.ok) return { status: "error", error: categoryAttrs.error };
  if (!photosLimit.ok) return { status: "error", error: photosLimit.error };

  // OLX rejects the whole advert over the category's own photo cap — this
  // app lets an item carry more final photos than any one category allows
  // (multiple accounts/backgrounds), so trim instead of failing.
  const cappedPhotoRows = photoRows.slice(0, photosLimit.data);

  const prepared = await prepareListingPhotoUrls(cappedPhotoRows, { whiteBackground, cropTop });
  if (!prepared.ok) return { status: "error", error: prepared.error };
  const imageUrls = prepared.urls;
  if (imageUrls.length === 0) return { status: "error", error: "Nie udało się przygotować zdjęć dla OLX" };

  const attributes = buildOlxAttributes(categoryAttrs.data, {
    condition: item.condition,
    size: item.size,
    brand: item.brand,
  });
  if (!attributes.ok) return { status: "error", error: attributes.error };

  const advert = await createOlxAdvert(auth.accessToken, {
    title: listing.title ?? "",
    description: listing.description ?? "",
    categoryId: category.data,
    price: item.price,
    externalId: itemId,
    images: imageUrls,
    attributes: attributes.data,
  });
  if (!advert.ok) return { status: "error", error: advert.error };

  const { error: insertError } = await supabaseAdmin.from("listing_publications").insert({
    listing_id: listingId,
    item_id: itemId,
    account_name: "OLX API",
    photo_set_id: photoSetId || null,
    olx_advert_id: advert.data.id,
    olx_url: advert.data.url,
    olx_status: advert.data.status,
    olx_synced_at: new Date().toISOString(),
  });
  if (insertError) return { status: "error", error: insertError.message };

  if (ADVANCEABLE_ITEM_STATUSES.includes(item.status)) {
    const { error: statusError } = await supabaseAdmin
      .from("items")
      .update({ status: "published" })
      .eq("id", itemId);
    if (statusError) return { status: "error", error: statusError.message };

    await supabaseAdmin.from("item_status_log").insert({
      item_id: itemId,
      from_status: item.status,
      to_status: "published",
    });
  }

  revalidatePath("/drafts");
  revalidatePath(`/items/${itemId}`);
  revalidatePath("/warehouse");
  revalidatePath("/dashboard");

  return { status: "success" };
}

export type AllegroCategoryOptionsResult =
  | { ok: true; manualParams: AllegroManualParam[] }
  | { ok: false; error: string };

// The publisher fills in whatever this listing's resolved category needs
// that this app can't derive automatically (see getAllegroManualParams) —
// Kolor/Materiał zewnętrzny on a sneaker, Zapięcie/Wysokość obcasa on a
// boot, potentially something else entirely on a category never seen
// before. Called once when PublishAllegroApiForm mounts so it can render
// the right fields instead of asking the publisher to guess/remember exact
// Allegro dictionary wording.
export async function getAllegroCategoryOptions(
  listingId: string
): Promise<AllegroCategoryOptionsResult> {
  const access = await checkRole("publisher", "admin");
  if (!access.ok) return { ok: false, error: access.error };

  const { data: listing } = await supabaseAdmin
    .from("marketplace_listings")
    .select("title")
    .eq("id", listingId)
    .single();
  if (!listing?.title) return { ok: false, error: "Brak tytułu ogłoszenia" };

  const auth = await getAllegroToken();
  if (!auth.ok) return { ok: false, error: auth.error };

  const category = await suggestAllegroCategory(auth.accessToken, listing.title);
  if (!category.ok) return { ok: false, error: category.error };

  const categoryParams = await getAllegroCategoryParameters(auth.accessToken, category.data);
  if (!categoryParams.ok) return { ok: false, error: categoryParams.error };

  return { ok: true, manualParams: getAllegroManualParams(categoryParams.data) };
}

// Real listing on Allegro, mirroring publishOlxAdvert. Always filed under
// "Allegro API" so it's visually distinct from manual Allegro postings.
// Some Allegro categories need product parameters this app doesn't track on
// items at all (Kolor/Materiał zewnętrzny on a sneaker, Zapięcie/Wysokość
// obcasa on a boot, ...) — the caller supplies whatever getAllegroManualParams
// flagged, by hand, right before publishing (see PublishAllegroApiForm).
export async function publishAllegroOffer(
  _prevState: PublicationActionState,
  formData: FormData
): Promise<PublicationActionState> {
  const access = await checkRole("publisher", "admin");
  if (!access.ok) return { status: "error", error: access.error };

  const listingId = String(formData.get("listingId") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();
  const photoSetId = String(formData.get("photoSetId") ?? "").trim();
  const whiteBackground = formData.get("whiteBackground") === "true";
  const cropTop = formData.get("cropTop") === "true";
  const manualValuesRaw = String(formData.get("manualValues") ?? "{}");
  let manualValues: Record<string, string> = {};
  try {
    manualValues = JSON.parse(manualValuesRaw);
  } catch {
    return { status: "error", error: "Nieprawidłowe dane pól Allegro" };
  }

  if (!listingId) return { status: "error", error: "Brak identyfikatora ogłoszenia" };
  if (!itemId) return { status: "error", error: "Brak identyfikatora towaru" };

  const [{ data: listing }, { data: item }] = await Promise.all([
    supabaseAdmin
      .from("marketplace_listings")
      .select("title, description, selected_photo_ids")
      .eq("id", listingId)
      .single(),
    supabaseAdmin
      .from("items")
      .select("brand, size, condition, model, insole_length, price, status")
      .eq("id", itemId)
      .single(),
  ]);

  if (!listing) return { status: "error", error: "Nie znaleziono ogłoszenia" };
  if (!item) return { status: "error", error: "Nie znaleziono towaru" };
  if (!item.price) return { status: "error", error: "Towar nie ma ustawionej ceny" };

  const { data: existing } = await supabaseAdmin
    .from("listing_publications")
    .select("id")
    .eq("listing_id", listingId)
    .eq("account_name", "Allegro API")
    .is("removed_at", null)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { status: "error", error: "To ogłoszenie jest już opublikowane przez Allegro API." };
  }

  const photoRows = await resolveListingPhotoRows(itemId, photoSetId || null, listing.selected_photo_ids);

  if (!photoRows || photoRows.length === 0) {
    return { status: "error", error: "Brak zdjęć finalnych do opublikowania" };
  }

  const auth = await getAllegroToken();
  if (!auth.ok) return { status: "error", error: auth.error };

  const category = await suggestAllegroCategory(auth.accessToken, listing.title ?? "");
  if (!category.ok) return { status: "error", error: category.error };

  const categoryParams = await getAllegroCategoryParameters(auth.accessToken, category.data);
  if (!categoryParams.ok) return { status: "error", error: categoryParams.error };

  const built = buildAllegroParameters(
    categoryParams.data,
    {
      condition: item.condition,
      size: item.size,
      brand: item.brand,
      model: item.model,
      insoleLength: item.insole_length,
    },
    manualValues
  );
  if (!built.ok) return { status: "error", error: built.error };

  const cappedPhotoRows = photoRows.slice(0, ALLEGRO_MAX_PHOTOS);
  const prepared = await prepareListingPhotoUrls(cappedPhotoRows, { whiteBackground, cropTop });
  if (!prepared.ok) return { status: "error", error: prepared.error };
  const sourceUrls = prepared.urls;
  if (sourceUrls.length === 0) return { status: "error", error: "Nie udało się przygotować zdjęć dla Allegro" };

  // Allegro doesn't accept an external URL directly in the offer — each
  // photo has to be uploaded to Allegro's own image host first.
  const uploadedImages: string[] = [];
  for (const url of sourceUrls) {
    const uploaded = await uploadAllegroImage(auth.accessToken, url);
    if (!uploaded.ok) return { status: "error", error: uploaded.error };
    uploadedImages.push(uploaded.data);
  }

  const offer = await createAllegroOffer(auth.accessToken, {
    title: listing.title ?? "",
    description: listing.description ?? "",
    categoryId: category.data,
    price: item.price,
    offerParameters: built.data.offerParameters,
    productParameters: built.data.productParameters,
    images: uploadedImages,
    active: true,
  });
  if (!offer.ok) return { status: "error", error: offer.error };

  const { error: insertError } = await supabaseAdmin.from("listing_publications").insert({
    listing_id: listingId,
    item_id: itemId,
    account_name: "Allegro API",
    photo_set_id: photoSetId || null,
    allegro_offer_id: offer.data.id,
    allegro_url: offer.data.url,
    allegro_status: offer.data.status,
    allegro_synced_at: new Date().toISOString(),
  });
  if (insertError) return { status: "error", error: insertError.message };

  if (ADVANCEABLE_ITEM_STATUSES.includes(item.status)) {
    const { error: statusError } = await supabaseAdmin
      .from("items")
      .update({ status: "published" })
      .eq("id", itemId);
    if (statusError) return { status: "error", error: statusError.message };

    await supabaseAdmin.from("item_status_log").insert({
      item_id: itemId,
      from_status: item.status,
      to_status: "published",
    });
  }

  revalidatePath("/drafts");
  revalidatePath(`/items/${itemId}`);
  revalidatePath("/warehouse");
  revalidatePath("/dashboard");

  return { status: "success" };
}

export async function removeListingPublication(
  _prevState: PublicationActionState,
  formData: FormData
): Promise<PublicationActionState> {
  const access = await checkRole("publisher", "admin");
  if (!access.ok) return { status: "error", error: access.error };

  const publicationId = String(formData.get("publicationId") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();

  if (!publicationId) return { status: "error", error: "Brak identyfikatora publikacji" };

  // Removing an OLX-API publication here only ever touched our own
  // bookkeeping — the actual advert stayed live on OLX with nobody the
  // wiser. Best-effort: OLX may have already disabled/expired it on its
  // own (its deactivate command 400s on anything not "active"), which is
  // fine — the row still gets removed either way.
  const { data: publication } = await supabaseAdmin
    .from("listing_publications")
    .select("olx_advert_id, allegro_offer_id")
    .eq("id", publicationId)
    .maybeSingle();

  if (publication?.olx_advert_id) {
    const auth = await getOlxToken();
    if (auth.ok) {
      await deactivateOlxAdvert(auth.accessToken, publication.olx_advert_id, false);
    }
  }

  if (publication?.allegro_offer_id) {
    const auth = await getAllegroToken();
    if (auth.ok) {
      await endAllegroOffer(auth.accessToken, publication.allegro_offer_id);
    }
  }

  const { error } = await supabaseAdmin
    .from("listing_publications")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", publicationId);

  if (error) return { status: "error", error: error.message };

  revalidatePath("/drafts");
  if (itemId) revalidatePath(`/items/${itemId}`);
  revalidatePath("/warehouse");
  revalidatePath("/dashboard");

  return { status: "success" };
}

export type PublishState = {
  status: "idle" | "success" | "error";
  error?: string;
};

export async function markReadyToPublish(
  _prevState: PublishState,
  formData: FormData
): Promise<PublishState> {
  const access = await checkRole("publisher", "admin");
  if (!access.ok) return { status: "error", error: access.error };

  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!itemId) return { status: "error", error: "Brak identyfikatora towaru" };

  const { data: item, error: itemError } = await supabaseAdmin
    .from("items")
    .select("status")
    .eq("id", itemId)
    .single();

  if (itemError) return { status: "error", error: itemError.message };
  if (item.status !== "ai_card_ready") {
    return { status: "error", error: "Towar nie jest w statusie Karta AI" };
  }

  const { error: statusError } = await supabaseAdmin
    .from("items")
    .update({ status: "ready_to_publish" })
    .eq("id", itemId);

  if (statusError) return { status: "error", error: statusError.message };

  await supabaseAdmin.from("item_status_log").insert({
    item_id: itemId,
    from_status: "ai_card_ready",
    to_status: "ready_to_publish",
  });

  revalidatePath("/drafts");

  return { status: "success" };
}

export type RefreshOlxState = {
  status: "idle" | "success" | "error";
  error?: string;
  olxStatus?: string;
  advertViews?: number;
};

// Pulls the live advert status + view count from OLX for one publication —
// pure reconciliation, doesn't touch items.status or anything else. A
// stale sync just means the button hasn't been pressed since the advert
// last changed on OLX's side (no polling/webhook, this is on-demand).
export async function refreshOlxAdvertStatus(
  _prevState: RefreshOlxState,
  formData: FormData
): Promise<RefreshOlxState> {
  const access = await checkRole("publisher", "admin");
  if (!access.ok) return { status: "error", error: access.error };

  const publicationId = String(formData.get("publicationId") ?? "").trim();
  const advertIdRaw = String(formData.get("olxAdvertId") ?? "").trim();
  const advertId = Number(advertIdRaw);
  if (!publicationId || !advertId) {
    return { status: "error", error: "Brak identyfikatora ogłoszenia OLX" };
  }

  const auth = await getOlxToken();
  if (!auth.ok) return { status: "error", error: auth.error };

  const [advert, stats] = await Promise.all([
    getOlxAdvert(auth.accessToken, advertId),
    getOlxAdvertStatistics(auth.accessToken, advertId),
  ]);
  if (!advert.ok) return { status: "error", error: advert.error };

  await supabaseAdmin
    .from("listing_publications")
    .update({
      olx_status: advert.data.status,
      olx_synced_at: new Date().toISOString(),
    })
    .eq("id", publicationId);

  revalidatePath("/drafts");

  return {
    status: "success",
    olxStatus: advert.data.status,
    advertViews: stats.ok ? stats.data.advertViews : undefined,
  };
}

export type RefreshAllegroState = {
  status: "idle" | "success" | "error";
  error?: string;
  allegroStatus?: string;
};

// Pulls the live offer status from Allegro for one publication — pure
// reconciliation, same shape as refreshOlxAdvertStatus. Allegro doesn't
// expose a simple per-offer view-count endpoint the way OLX does, so
// there's no analogous stat to surface here.
export async function refreshAllegroOfferStatus(
  _prevState: RefreshAllegroState,
  formData: FormData
): Promise<RefreshAllegroState> {
  const access = await checkRole("publisher", "admin");
  if (!access.ok) return { status: "error", error: access.error };

  const publicationId = String(formData.get("publicationId") ?? "").trim();
  const offerId = String(formData.get("allegroOfferId") ?? "").trim();
  if (!publicationId || !offerId) {
    return { status: "error", error: "Brak identyfikatora oferty Allegro" };
  }

  const auth = await getAllegroToken();
  if (!auth.ok) return { status: "error", error: auth.error };

  const offer = await getAllegroOffer(auth.accessToken, offerId);
  if (!offer.ok) return { status: "error", error: offer.error };

  await supabaseAdmin
    .from("listing_publications")
    .update({
      allegro_status: offer.data.status,
      allegro_synced_at: new Date().toISOString(),
    })
    .eq("id", publicationId);

  revalidatePath("/drafts");

  return { status: "success", allegroStatus: offer.data.status };
}
