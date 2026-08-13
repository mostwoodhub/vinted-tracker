import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { ExpensesView, type ExpenseRow } from "./ExpensesView";

export default async function ExpensesPage() {
  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);

  if (!roles.has("admin")) {
    redirect("/warehouse");
  }

  const { data } = await supabaseAdmin
    .from("expenses")
    .select("id, expense_date, category, description, amount, batch_name")
    .is("deleted_at", null)
    .order("expense_date", { ascending: false });

  const expenses = (data ?? []) as ExpenseRow[];

  return <ExpensesView expenses={expenses} />;
}
