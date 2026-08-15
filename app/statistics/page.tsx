import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all";
import type { SaleRow } from "@/lib/sales-types";
import type { MatchableItem } from "@/lib/sales-stats";
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

  // Includes deleted items too — matching is about historical linkage for
  // reporting, not current warehouse state.
  const { data: itemRows } = await supabaseAdmin
    .from("items")
    .select("internal_number, brand, size, batches(label)");

  const items: MatchableItem[] = (itemRows ?? []).map((row) => {
    const batches = row.batches as
      | { label: string | null }
      | { label: string | null }[]
      | null;
    const batchLabel = Array.isArray(batches)
      ? batches[0]?.label ?? null
      : batches?.label ?? null;
    return {
      internalNumber: row.internal_number,
      batchLabel,
      brand: row.brand,
      size: row.size,
    };
  });

  return (
    <StatisticsView
      sales={sales}
      expenses={expenses}
      profiles={(profiles ?? []) as ProfileRow[]}
      items={items}
    />
  );
}
