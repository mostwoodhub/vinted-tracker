import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all";
import type { SaleRow } from "@/lib/sales-types";
import { StatisticsView, type ExpenseRow, type ProfileRow } from "./StatisticsView";

export default async function StatisticsPage() {
  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);

  if (!roles.has("admin")) {
    redirect("/warehouse");
  }

  const sales = await fetchAllRows<SaleRow>((from, to) =>
    supabaseAdmin
      .from("sales")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, to)
  );

  const expenses = await fetchAllRows<ExpenseRow>((from, to) =>
    supabaseAdmin
      .from("expenses")
      .select("expense_date, category, amount, batch_name")
      .is("deleted_at", null)
      .order("expense_date", { ascending: false })
      .range(from, to)
  );

  const { data: profiles } = await supabaseAdmin
    .from("sales_profiles_archive")
    .select("id, email, display_name");

  return (
    <StatisticsView
      sales={sales}
      expenses={expenses}
      profiles={(profiles ?? []) as ProfileRow[]}
    />
  );
}
