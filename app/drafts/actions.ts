"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRole } from "@/lib/auth";
import {
  getOlxToken,
  suggestOlxCategory,
  getOlxCategoryAttributes,
  getOlxCategoryPhotosLimit,
  buildOlxAttributes,
  createOlxAdvert,
  getOlxAdvert,
  getOlxAdvertStatistics,
} from "@/lib/olx-client";

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

    const { error } = await supabaseAdmin
      .from("marketplace_listings")
      .update({ title, description })
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

  if (!listingId) return { status: "error", error: "Brak identyfikatora ogłoszenia" };
  if (!itemId) return { status: "error", error: "Brak identyfikatora towaru" };

  const [{ data: listing }, { data: item }] = await Promise.all([
    supabaseAdmin
      .from("marketplace_listings")
      .select("title, description")
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

  let photoQuery = supabaseAdmin
    .from("item_photos")
    .select("storage_path")
    .eq("item_id", itemId)
    .eq("is_working_photo", false)
    .order("sort_order", { ascending: true });
  photoQuery = photoSetId ? photoQuery.eq("photo_set_id", photoSetId) : photoQuery.is("photo_set_id", null);
  const { data: photoRows } = await photoQuery;

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

  // Signed just before the OLX call, not reused/cached — OLX fetches these
  // URLs itself right after this request completes, so a short lifetime is
  // fine and avoids ever making item photos public.
  const { data: signedPhotos, error: signError } = await supabaseAdmin.storage
    .from("item-photos")
    .createSignedUrls(
      cappedPhotoRows.map((p) => p.storage_path),
      600
    );
  if (signError) return { status: "error", error: signError.message };
  const imageUrls = (signedPhotos ?? []).map((p) => p.signedUrl).filter((u): u is string => Boolean(u));
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

export async function removeListingPublication(
  _prevState: PublicationActionState,
  formData: FormData
): Promise<PublicationActionState> {
  const access = await checkRole("publisher", "admin");
  if (!access.ok) return { status: "error", error: access.error };

  const publicationId = String(formData.get("publicationId") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();

  if (!publicationId) return { status: "error", error: "Brak identyfikatora publikacji" };

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
