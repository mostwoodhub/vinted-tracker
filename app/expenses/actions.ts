"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRole } from "@/lib/auth";
import { normalizeBatchLabel } from "@/lib/batches";

export type ExpenseActionState = {
  status: "idle" | "success" | "error";
  error?: string;
};

function revalidateExpensePaths() {
  revalidatePath("/expenses");
  revalidatePath("/statistics");
  revalidatePath("/sales");
  revalidatePath("/batches-archive");
  revalidatePath("/charts");
  revalidatePath("/dashboard");
}

function parseExpenseFields(formData: FormData):
  | { ok: true; fields: { expense_date: string; category: string; description: string | null; amount: number; batch_name: string | null } }
  | { ok: false; error: string } {
  const expenseDate = String(formData.get("expenseDate") ?? "").trim();
  if (!expenseDate) return { ok: false, error: "Podaj datę" };

  const category = String(formData.get("category") ?? "").trim();
  if (!category) return { ok: false, error: "Wybierz kategorię" };

  const description = String(formData.get("description") ?? "").trim();

  const amountRaw = String(formData.get("amount") ?? "").trim();
  if (!amountRaw) return { ok: false, error: "Podaj kwotę" };
  const amount = Number(amountRaw.replace(",", "."));
  if (Number.isNaN(amount) || amount <= 0) return { ok: false, error: "Nieprawidłowa kwota" };

  // Same leading-letters normalization as intake/batch creation — a typo
  // like "R15583" here shouldn't create a batch literally named that.
  const batchNameRaw = String(formData.get("batchName") ?? "").trim();
  const batchName = batchNameRaw ? normalizeBatchLabel(batchNameRaw) : null;

  return {
    ok: true,
    fields: { expense_date: expenseDate, category, description: description || null, amount, batch_name: batchName },
  };
}

export async function createExpense(
  _prevState: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  const access = await checkRole("admin");
  if (!access.ok) return { status: "error", error: access.error };

  const parsed = parseExpenseFields(formData);
  if (!parsed.ok) return { status: "error", error: parsed.error };

  // expenses.id has no DB default (unlike batches) — must be supplied
  // explicitly, same as sales_accounts_archive.
  const { error } = await supabaseAdmin.from("expenses").insert({ id: randomUUID(), ...parsed.fields });
  if (error) return { status: "error", error: error.message };

  revalidateExpensePaths();
  return { status: "success" };
}

export async function updateExpense(
  _prevState: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  const access = await checkRole("admin");
  if (!access.ok) return { status: "error", error: access.error };

  const expenseId = String(formData.get("expenseId") ?? "").trim();
  if (!expenseId) return { status: "error", error: "Brak wydatku" };

  const parsed = parseExpenseFields(formData);
  if (!parsed.ok) return { status: "error", error: parsed.error };

  const { error } = await supabaseAdmin.from("expenses").update(parsed.fields).eq("id", expenseId);
  if (error) return { status: "error", error: error.message };

  revalidateExpensePaths();
  return { status: "success" };
}

export async function deleteExpense(
  _prevState: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  const access = await checkRole("admin");
  if (!access.ok) return { status: "error", error: access.error };

  const expenseId = String(formData.get("expenseId") ?? "").trim();
  if (!expenseId) return { status: "error", error: "Brak wydatku" };

  const { error } = await supabaseAdmin
    .from("expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", expenseId);
  if (error) return { status: "error", error: error.message };

  revalidateExpensePaths();
  return { status: "success" };
}
