"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRole } from "@/lib/auth";

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
