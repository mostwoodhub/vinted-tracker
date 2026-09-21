import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentEmployee, getEffectiveRoles, isIntakeOnly } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all";
import type { SaleRow } from "@/lib/sales-types";
import { SalesView, type ExpenseRow, type ProfileRow } from "./SalesView";

export default async function SalesPage() {
  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);

  if (!employee || (!roles.has("admin") && !roles.has("sales"))) {
    redirect(isIntakeOnly(roles) ? "/intake" : "/warehouse");
  }

  const isAdmin = roles.has("admin");

  const [sales, expenses, { data: profiles }, { data: accountRows }] = await Promise.all([
    fetchAllRows<SaleRow>((from, to) => {
      let query = supabaseAdmin
        .from("sales")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      // Non-admins (e.g. the sales role) only see sales they recorded
      // themselves — everyone else's stays out of view.
      if (!isAdmin) query = query.eq("created_by", employee.id);
      return query.range(from, to);
    }),
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
      isAdmin={isAdmin}
      accountNames={accountNames}
    />
  );
}
