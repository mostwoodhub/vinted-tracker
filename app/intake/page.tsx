import { getDistinctValues } from "@/lib/distinct-values";
import { suggestNextLegacyNumber } from "@/lib/next-legacy-number";
import { getCurrentEmployee } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { warsawDateString } from "@/lib/warsaw-time";
import { IntakeForm } from "./IntakeForm";

export default async function IntakePage() {
  const employee = await getCurrentEmployee();

  const [brands, sizes, batchLabels, suggestedLegacyNumber, todayCount] = await Promise.all([
    getDistinctValues("items", "brand"),
    getDistinctValues("items", "size"),
    getDistinctValues("batches", "label"),
    suggestNextLegacyNumber(),
    employee ? countTodaysIntake(employee.id) : Promise.resolve(null),
  ]);

  return (
    <IntakeForm
      brands={brands}
      sizes={sizes}
      batchLabels={batchLabels}
      suggestedLegacyNumber={suggestedLegacyNumber}
      todayCount={todayCount}
    />
  );
}

// Shown to the employee themselves, right on the form they use all day — so
// they can see their own actions are actually being recorded, not just admin
// looking at a dashboard elsewhere.
async function countTodaysIntake(employeeId: string): Promise<number> {
  const todayWarsaw = warsawDateString(new Date());
  // A 2-day UTC window is a cheap, DST-safe way to bound the query to
  // "recent" rows without doing Warsaw-offset math server-side — the exact
  // Warsaw-day filter happens in JS below, this just keeps the row count
  // small regardless of the employee's total history.
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("items")
    .select("created_at")
    .eq("created_by", employeeId)
    .is("deleted_at", null)
    .gte("created_at", since);

  return (data ?? []).filter(
    (item) => item.created_at && warsawDateString(new Date(item.created_at)) === todayWarsaw
  ).length;
}
