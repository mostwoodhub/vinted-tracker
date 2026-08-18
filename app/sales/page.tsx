import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentEmployee, getEffectiveRoles, isIntakeOnly } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all";
import type { SaleRow } from "@/lib/sales-types";
import { SalesView, type ExpenseRow, type ProfileRow } from "./SalesView";

export default async function SalesPage() {
  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);

  if (!roles.has("admin")) {
    redirect(isIntakeOnly(roles) ? "/intake" : "/warehouse");
  }

  const [sales, expenses, { data: profiles }, { data: accountRows }] = await Promise.all([
    fetchAllRows<SaleRow>((from, to) =>
      supabaseAdmin
        .from("sales")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(from, to)
    ),
    fetchAllRows<ExpenseRow>((from, to) =>
      supabaseAdmin
        .from("expenses")
        .select("expense_date, category, amount, batch_name")
        .is("deleted_at", null)
        .order("expense_date", { ascending: false })
        .range(from, to)
    ),
    supabaseAdmin.from("sales_profiles_archive").select("id, email, display_name"),
    supabaseAdmin
      .from("sales_accounts_archive")
      .select("name")
      .order("sort_order", { ascending: true }),
  ]);
  const accountNames = (accountRows ?? []).map((row) => row.name).filter(Boolean) as string[];

  return (
    <SalesView
      sales={sales}
      expenses={expenses}
      profiles={(profiles ?? []) as ProfileRow[]}
      isAdmin={roles.has("admin")}
      accountNames={accountNames}
    />
  );
}
