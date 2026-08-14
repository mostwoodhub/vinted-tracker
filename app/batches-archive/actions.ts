"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRole } from "@/lib/auth";
import { getNextBatchNumber } from "@/lib/batches";
import type { BatchActionState } from "@/app/batches/[id]/actions";

// Batches were previously only ever created as a side effect of typing a new
// label into the "Partia" field at intake — there was no way to start one
// on its own (e.g. to log a purchase, with cost/seller/quantity, before any
// item has been added to it yet). This gives that an explicit entry point.
export async function createBatch(
  _prevState: BatchActionState,
  formData: FormData
): Promise<BatchActionState> {
  const access = await checkRole("admin");
  if (!access.ok) return { status: "error", error: access.error };

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { status: "error", error: "Podaj nazwę partii" };

  const { data: existing } = await supabaseAdmin
    .from("batches")
    .select("id")
    .eq("label", label)
    .maybeSingle();
  if (existing) {
    return { status: "error", error: "Partia o tej nazwie już istnieje" };
  }

  const purchaseLocation = String(formData.get("purchaseLocation") ?? "").trim();

  const costRaw = String(formData.get("purchaseCost") ?? "").trim();
  let purchaseCost: number | null = null;
  if (costRaw) {
    purchaseCost = Number(costRaw.replace(",", "."));
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

  let batchId: string;
  try {
    const nextBatchNumber = await getNextBatchNumber();
    const { data: created, error } = await supabaseAdmin
      .from("batches")
      .insert({
        label,
        batch_number: nextBatchNumber,
        purchase_cost: purchaseCost,
        purchase_location: purchaseLocation || null,
        quantity,
      })
      .select("id")
      .single();

    if (error) return { status: "error", error: error.message };
    batchId = created.id;
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Nie udało się utworzyć partii",
    };
  }

  revalidatePath("/batches-archive");
  redirect(`/batches/${batchId}`);
}
