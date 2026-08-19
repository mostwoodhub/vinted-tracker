import { getDistinctValues } from "@/lib/distinct-values";
import { suggestNextLegacyNumber } from "@/lib/next-legacy-number";
import { getCurrentEmployee } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { warsawDateString } from "@/lib/warsaw-time";
import type { IntakeItem } from "@/app/dashboard/IntakeStatsSection";
import { IntakeForm } from "./IntakeForm";

export default async function IntakePage() {
  const employee = await getCurrentEmployee();
  const todayWarsaw = warsawDateString(new Date());

  const [brands, sizes, batchLabels, suggestedLegacyNumber, ownItems] = await Promise.all([
    getDistinctValues("items", "brand"),
    getDistinctValues("items", "size"),
    getDistinctValues("batches", "label"),
    suggestNextLegacyNumber(),
    employee ? fetchOwnIntakeItems(employee.id) : Promise.resolve(null),
  ]);

  const todayCount =
    ownItems?.filter((item) => warsawDateString(new Date(item.createdAt)) === todayWarsaw).length ?? null;

  return (
    <IntakeForm
      brands={brands}
      sizes={sizes}
      batchLabels={batchLabels}
      suggestedLegacyNumber={suggestedLegacyNumber}
      todayCount={todayCount}
      ownItems={ownItems}
      employeeId={employee?.id ?? null}
      employeeName={employee?.full_name ?? null}
      todayWarsaw={todayWarsaw}
    />
  );
}

// Shown to the employee themselves, right on the form they use all day — so
// they can see their own actions are actually being recorded, not just admin
// looking at a dashboard elsewhere. Full history (not date-bounded) since it
// also feeds the day/week/month browsable chart below the form.
async function fetchOwnIntakeItems(employeeId: string): Promise<IntakeItem[]> {
  const { data } = await supabaseAdmin
    .from("items")
    .select("created_at")
    .eq("created_by", employeeId)
    .is("deleted_at", null);

  return (data ?? [])
    .filter((item) => item.created_at)
    .map((item) => ({ employeeId, createdAt: item.created_at as string }));
}
