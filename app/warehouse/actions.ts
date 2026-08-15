"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRole } from "@/lib/auth";
import { ITEM_STATUSES } from "@/lib/item-statuses";

export type UpdateCostState = {
  status: "idle" | "success" | "error";
  error?: string;
};

export async function updateItemCostPrice(
  _prevState: UpdateCostState,
  formData: FormData
): Promise<UpdateCostState> {
  const access = await checkRole("admin");
  if (!access.ok) return { status: "error", error: access.error };

  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!itemId) return { status: "error", error: "Brak towaru" };

  const raw = String(formData.get("costPrice") ?? "").trim();
  let costPrice: number | null = null;
  if (raw) {
    costPrice = Number(raw.replace(",", "."));
    if (Number.isNaN(costPrice)) {
      return { status: "error", error: "Nieprawidłowa kwota" };
    }
  }

  const { error } = await supabaseAdmin
    .from("items")
    .update({ cost_price: costPrice })
    .eq("id", itemId);

  if (error) return { status: "error", error: error.message };

  revalidatePath("/warehouse");

  return { status: "success" };
}

export async function deleteItems(itemIds: string[]) {
  const access = await checkRole("admin");
  if (!access.ok) throw new Error(access.error);

  const ids = itemIds.filter(Boolean);
  if (ids.length === 0) return;

  const { error } = await supabaseAdmin
    .from("items")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);

  if (error) throw new Error(error.message);

  revalidatePath("/warehouse");
  revalidatePath("/pending");
}

export async function bulkUpdateStatus(itemIds: string[], status: string) {
  const access = await checkRole("admin");
  if (!access.ok) throw new Error(access.error);

  const ids = itemIds.filter(Boolean);
  if (ids.length === 0) return;

  if (!(ITEM_STATUSES as readonly string[]).includes(status)) {
    throw new Error("Nieprawidłowy status");
  }

  const { data: currentRows, error: fetchError } = await supabaseAdmin
    .from("items")
    .select("id, status")
    .in("id", ids);

  if (fetchError) throw new Error(fetchError.message);

  const { error } = await supabaseAdmin
    .from("items")
    .update({ status })
    .in("id", ids);

  if (error) throw new Error(error.message);

  const logRows = (currentRows ?? [])
    .filter((row) => row.status !== status)
    .map((row) => ({ item_id: row.id, from_status: row.status, to_status: status }));

  if (logRows.length > 0) {
    await supabaseAdmin.from("item_status_log").insert(logRows);
  }

  revalidatePath("/warehouse");
  revalidatePath("/pending");
}

export async function bulkUpdatePrice(itemIds: string[], price: number) {
  const access = await checkRole("admin");
  if (!access.ok) throw new Error(access.error);

  const ids = itemIds.filter(Boolean);
  if (ids.length === 0) return;

  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Nieprawidłowa cena");
  }

  const { error } = await supabaseAdmin
    .from("items")
    .update({ price })
    .in("id", ids);

  if (error) throw new Error(error.message);

  revalidatePath("/warehouse");
  revalidatePath("/pending");
}
