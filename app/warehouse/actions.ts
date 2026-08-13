"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRole } from "@/lib/auth";

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
