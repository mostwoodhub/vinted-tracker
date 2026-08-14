"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRole } from "@/lib/auth";

export type BatchActionState = {
  status: "idle" | "success" | "error";
  error?: string;
};

export async function updateBatchPurchaseCost(
  _prevState: BatchActionState,
  formData: FormData
): Promise<BatchActionState> {
  const access = await checkRole("admin");
  if (!access.ok) return { status: "error", error: access.error };

  const batchId = String(formData.get("batchId") ?? "").trim();
  if (!batchId) return { status: "error", error: "Brak partii" };

  const label = String(formData.get("label") ?? "").trim();
  const purchaseLocation = String(formData.get("purchaseLocation") ?? "").trim();

  const raw = String(formData.get("purchaseCost") ?? "").trim();
  let purchaseCost: number | null = null;
  if (raw) {
    purchaseCost = Number(raw.replace(",", "."));
    if (Number.isNaN(purchaseCost)) {
      return { status: "error", error: "Nieprawidłowa kwota" };
    }
  }

  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  let quantity: number | null = null;
  if (quantityRaw) {
    quantity = Number(quantityRaw);
    if (!Number.isInteger(quantity) || quantity < 0) {
      return { status: "error", error: "Nieprawidłowa ilość" };
    }
  }

  const { error } = await supabaseAdmin
    .from("batches")
    .update({
      label: label || null,
      purchase_cost: purchaseCost,
      purchase_location: purchaseLocation || null,
      quantity,
    })
    .eq("id", batchId);

  if (error) return { status: "error", error: error.message };

  revalidatePath(`/batches/${batchId}`);
  revalidatePath("/dashboard");
  revalidatePath("/batches-archive");

  return { status: "success" };
}

export async function deleteBatch(
  _prevState: BatchActionState,
  formData: FormData
): Promise<BatchActionState> {
  const access = await checkRole("admin");
  if (!access.ok) return { status: "error", error: access.error };

  const batchId = String(formData.get("batchId") ?? "").trim();
  if (!batchId) return { status: "error", error: "Brak partii" };

  const { error: unlinkError } = await supabaseAdmin
    .from("items")
    .update({ batch_id: null })
    .eq("batch_id", batchId);

  if (unlinkError) return { status: "error", error: unlinkError.message };

  const { error: deleteError } = await supabaseAdmin
    .from("batches")
    .delete()
    .eq("id", batchId);

  if (deleteError) return { status: "error", error: deleteError.message };

  revalidatePath("/dashboard");
  revalidatePath("/batches-archive");

  return { status: "success" };
}

export async function distributeBatchCost(
  _prevState: BatchActionState,
  formData: FormData
): Promise<BatchActionState> {
  const access = await checkRole("admin");
  if (!access.ok) return { status: "error", error: access.error };

  const batchId = String(formData.get("batchId") ?? "").trim();
  if (!batchId) return { status: "error", error: "Brak partii" };

  const { data: batch, error: batchError } = await supabaseAdmin
    .from("batches")
    .select("purchase_cost")
    .eq("id", batchId)
    .single();

  if (batchError) return { status: "error", error: batchError.message };
  if (batch.purchase_cost == null) {
    return { status: "error", error: "Podaj najpierw koszt zakupu partii" };
  }

  const { count, error: countError } = await supabaseAdmin
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId);

  if (countError) return { status: "error", error: countError.message };
  if (!count) return { status: "error", error: "Brak towarów w partii" };

  const share = Math.round((batch.purchase_cost / count) * 100) / 100;

  const { error: updateError } = await supabaseAdmin
    .from("items")
    .update({ cost_price: share })
    .eq("batch_id", batchId)
    .is("cost_price", null);

  if (updateError) return { status: "error", error: updateError.message };

  revalidatePath(`/batches/${batchId}`);
  revalidatePath("/warehouse");

  return { status: "success" };
}
