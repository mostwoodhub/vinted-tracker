"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRole } from "@/lib/auth";
import { ARCHIWUM_2025_ACCOUNT_NAME } from "@/lib/archiwum";

export type AccountActionState = {
  status: "idle" | "success" | "error";
  error?: string;
};

function revalidateAccountPaths() {
  revalidatePath("/accounts");
  revalidatePath("/sales");
  revalidatePath("/sales/add");
}

export async function createAccount(
  _prevState: AccountActionState,
  formData: FormData
): Promise<AccountActionState> {
  const access = await checkRole("admin");
  if (!access.ok) return { status: "error", error: access.error };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error", error: "Podaj nazwę konta" };

  const { data: existing } = await supabaseAdmin
    .from("sales_accounts_archive")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if (existing) return { status: "error", error: "Konto o tej nazwie już istnieje" };

  const { data: maxRow } = await supabaseAdmin
    .from("sales_accounts_archive")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (maxRow?.sort_order ?? 0) + 1;

  // sales_accounts_archive.id has no DB default, must be supplied explicitly.
  const { error } = await supabaseAdmin
    .from("sales_accounts_archive")
    .insert({ id: randomUUID(), name, sort_order: nextSortOrder });

  if (error) return { status: "error", error: error.message };

  revalidateAccountPaths();
  return { status: "success" };
}

export async function renameAccount(
  _prevState: AccountActionState,
  formData: FormData
): Promise<AccountActionState> {
  const access = await checkRole("admin");
  if (!access.ok) return { status: "error", error: access.error };

  const accountId = String(formData.get("accountId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!accountId) return { status: "error", error: "Brak konta" };
  if (!name) return { status: "error", error: "Podaj nazwę konta" };

  const { data: current, error: currentError } = await supabaseAdmin
    .from("sales_accounts_archive")
    .select("name")
    .eq("id", accountId)
    .single();
  if (currentError) return { status: "error", error: currentError.message };

  if (current.name !== name) {
    const { data: existing } = await supabaseAdmin
      .from("sales_accounts_archive")
      .select("id")
      .eq("name", name)
      .maybeSingle();
    if (existing) return { status: "error", error: "Konto o tej nazwie już istnieje" };
  }

  const { error } = await supabaseAdmin
    .from("sales_accounts_archive")
    .update({ name })
    .eq("id", accountId);
  if (error) return { status: "error", error: error.message };

  // account_name on `sales` is a plain text copy, not a foreign key — a
  // rename here must also update every sale that references the old name,
  // otherwise those sales silently fall off the account going forward.
  if (current.name && current.name !== name) {
    const { error: cascadeError } = await supabaseAdmin
      .from("sales")
      .update({ account_name: name })
      .eq("account_name", current.name);
    if (cascadeError) return { status: "error", error: cascadeError.message };
  }

  revalidateAccountPaths();
  return { status: "success" };
}

// Miesiąc, Продажі, Товар, Витрати, Дохід, Прибуток, Чистий прибуток — z
// rocznego raportu 2025 starej aplikacji. Zweryfikowane: dla każdego
// miesiąca Прибуток - Витрати == Чистий прибуток co do grosza.
const ARCHIWUM_2025_MONTHS = [
  { pl: "Styczeń", num: "01", sales: 274, goods: 54565.0, expenses: 19817.0, revenue: 67711.19, profit: 28311.19 },
  { pl: "Luty", num: "02", sales: 317, goods: 46950.0, expenses: 3768.0, revenue: 80903.21, profit: 31864.21 },
  { pl: "Marzec", num: "03", sales: 474, goods: 59500.0, expenses: 4918.0, revenue: 107302.8, profit: 32110.49 },
  { pl: "Kwiecień", num: "04", sales: 574, goods: 80700.0, expenses: 17568.0, revenue: 133572.94, profit: 44216.3 },
  { pl: "Maj", num: "05", sales: 563, goods: 169450.0, expenses: 8256.0, revenue: 136613.78, profit: 43881.07 },
  { pl: "Czerwiec", num: "06", sales: 446, goods: 86000.0, expenses: 16772.0, revenue: 110577.87, profit: 32348.7 },
  { pl: "Lipiec", num: "07", sales: 470, goods: 18500.0, expenses: 11045.0, revenue: 115584.03, profit: 34287.53 },
  { pl: "Sierpień", num: "08", sales: 652, goods: 106000.0, expenses: 8410.0, revenue: 154956.46, profit: 42969.4 },
  { pl: "Wrzesień", num: "09", sales: 644, goods: 10000.0, expenses: 2680.0, revenue: 154264.74, profit: 36325.27 },
  { pl: "Październik", num: "10", sales: 625, goods: 0.0, expenses: 20810.0, revenue: 157568.07, profit: 35740.09 },
  { pl: "Listopad", num: "11", sales: 599, goods: 0.0, expenses: 0.0, revenue: 142854.17, profit: 33939.89 },
  { pl: "Grudzień", num: "12", sales: 511, goods: 0.0, expenses: 0.0, revenue: 110758.78, profit: 26255.16 },
] as const;

// Mirrors the old app's "Zaimportuj raport 2025 (jednorazowo)" action: adds
// 12 zbiorcze monthly entries onto the "Archiwum 2025" account so the 2025
// annual report shows up in Statystyki/Wykresy. These are aggregate sums
// from the yearly report, not individual sales.
export async function importArchiwum2025(
  _prevState: AccountActionState,
  _formData: FormData
): Promise<AccountActionState> {
  const access = await checkRole("admin");
  if (!access.ok) return { status: "error", error: access.error };

  const { data: existingAccount } = await supabaseAdmin
    .from("sales_accounts_archive")
    .select("id")
    .eq("name", ARCHIWUM_2025_ACCOUNT_NAME)
    .maybeSingle();

  const { data: existingSales } = await supabaseAdmin
    .from("sales")
    .select("id")
    .eq("account_name", ARCHIWUM_2025_ACCOUNT_NAME)
    .limit(1);

  if (existingAccount || (existingSales && existingSales.length > 0)) {
    return { status: "error", error: "Raport 2025 już zaimportowany." };
  }

  const nowIso = new Date().toISOString();

  const { data: maxRow } = await supabaseAdmin
    .from("sales_accounts_archive")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (maxRow?.sort_order ?? 0) + 1;

  // sales_accounts_archive.id has no DB default here, so it must be
  // supplied explicitly (unlike what createAccount above assumes).
  const { error: accountError } = await supabaseAdmin
    .from("sales_accounts_archive")
    .insert({ id: randomUUID(), name: ARCHIWUM_2025_ACCOUNT_NAME, sort_order: nextSortOrder });
  if (accountError) return { status: "error", error: accountError.message };

  const saleRows = ARCHIWUM_2025_MONTHS.map((m) => ({
    id: randomUUID(),
    created_at: nowIso,
    sale_date: `2025-${m.num}-15`,
    platform: "Archiwum",
    legacy_shoe_id: null,
    buyer_name: `Archiwum 2025 — ${m.pl}`,
    cost_price: m.goods,
    sale_price: m.revenue,
    country: null,
    fee_percent: 0,
    fee_amount: 0,
    vat_rate: 0,
    vat_amount: 0,
    vat_mode: null,
    income_tax_applied: false,
    income_tax_amount: 0,
    net_profit: m.profit,
    account_name: ARCHIWUM_2025_ACCOUNT_NAME,
    quantity: m.sales,
    confirmed: true,
    photo_url: null,
    photo_urls: null,
    label_url: null,
    label_url2: null,
    label_filename: null,
    label_filename2: null,
    legacy_user_id: null,
    items: null,
  }));

  const { error: salesError } = await supabaseAdmin.from("sales").insert(saleRows);
  if (salesError) return { status: "error", error: salesError.message };

  const expenseRows = ARCHIWUM_2025_MONTHS.filter((m) => m.expenses > 0).map((m) => ({
    id: randomUUID(),
    created_at: nowIso,
    expense_date: `2025-${m.num}-15`,
    category: ARCHIWUM_2025_ACCOUNT_NAME,
    description: `Wydatki — ${m.pl} 2025 (raport roczny, import jednorazowy)`,
    amount: m.expenses,
    batch_name: null,
    deleted_at: null,
  }));

  if (expenseRows.length > 0) {
    const { error: expensesError } = await supabaseAdmin.from("expenses").insert(expenseRows);
    if (expensesError) return { status: "error", error: expensesError.message };
  }

  revalidateAccountPaths();
  revalidatePath("/statistics");
  revalidatePath("/charts");
  revalidatePath("/expenses");
  return { status: "success" };
}

export async function deleteAccount(
  _prevState: AccountActionState,
  formData: FormData
): Promise<AccountActionState> {
  const access = await checkRole("admin");
  if (!access.ok) return { status: "error", error: access.error };

  const accountId = String(formData.get("accountId") ?? "").trim();
  if (!accountId) return { status: "error", error: "Brak konta" };

  // Only removes it from the pickable list, same as batch deletion — sales
  // that already reference this account keep their account_name text as a
  // historical record rather than being touched.
  const { error } = await supabaseAdmin
    .from("sales_accounts_archive")
    .delete()
    .eq("id", accountId);
  if (error) return { status: "error", error: error.message };

  revalidateAccountPaths();
  return { status: "success" };
}
