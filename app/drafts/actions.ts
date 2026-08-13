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
