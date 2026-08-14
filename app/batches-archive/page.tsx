import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all";
import { formatPln } from "@/lib/format";
import { computeBatchPerformance } from "@/lib/batch-stats";
import type { SaleRow } from "@/lib/sales-types";
import { RealBatchesSection, type RealBatchRow } from "./RealBatchesSection";
import { cardClass, headingClass, mutedTextClass, pageWrapClass } from "@/lib/ui-classes";

export default async function BatchesArchivePage() {
  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);

  if (!roles.has("admin")) {
    redirect("/warehouse");
  }

  const { data: expenseRows } = await supabaseAdmin
    .from("expenses")
    .select("batch_name, amount")
    .is("deleted_at", null)
    .not("batch_name", "is", null);

  const sales = await fetchAllRows<Pick<SaleRow, "legacy_shoe_id" | "net_profit">>(
    (from, to) =>
      supabaseAdmin
        .from("sales")
        .select("legacy_shoe_id, net_profit")
        .is("deleted_at", null)
        .not("legacy_shoe_id", "is", null)
        .order("created_at", { ascending: false })
        .range(from, to)
  );

  const batches = computeBatchPerformance(
    sales as SaleRow[],
    expenseRows ?? []
  );

  const { data: realBatchesRaw } = await supabaseAdmin
    .from("batches")
    .select("id, label, batch_number, purchase_cost, purchase_location, quantity")
    .order("batch_number", { ascending: true });

  const { data: itemBatchLinks } = await supabaseAdmin
    .from("items")
    .select("batch_id, status")
    .not("batch_id", "is", null)
    .is("deleted_at", null);

  const itemCountByBatch = new Map<string, number>();
  const soldCountByBatch = new Map<string, number>();
  for (const row of itemBatchLinks ?? []) {
    if (!row.batch_id) continue;
    itemCountByBatch.set(row.batch_id, (itemCountByBatch.get(row.batch_id) ?? 0) + 1);
    if (row.status === "sold") {
      soldCountByBatch.set(row.batch_id, (soldCountByBatch.get(row.batch_id) ?? 0) + 1);
    }
  }

  const realBatches: RealBatchRow[] = (realBatchesRaw ?? []).map((b) => ({
    id: b.id,
    label: b.label,
    batchNumber: b.batch_number,
    purchaseCost: b.purchase_cost,
    purchaseLocation: b.purchase_location,
    quantity: b.quantity,
    itemCount: itemCountByBatch.get(b.id) ?? 0,
    soldCount: soldCountByBatch.get(b.id) ?? 0,
  }));

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-[var(--space-xl)] px-6 py-12">
        <RealBatchesSection batches={realBatches} />

        <div className="flex flex-col gap-[var(--space-lg)]">
          <h1 className={headingClass}>Partie obuwia</h1>
          <p className={`text-sm ${mutedTextClass}`}>
            Partie zakupowe ze starego systemu — koszt vs. przychód netto ze
            sprzedaży dopasowanej po prefiksie starego numeru obuwia.
          </p>

          {batches.length === 0 && (
            <p className={`text-sm ${mutedTextClass}`}>Brak partii.</p>
          )}

          <div className="flex flex-col gap-[var(--gap-default)]">
            {batches.map((batch) => (
              <div
                key={batch.name}
                className={`flex items-center gap-[var(--space-md)] ${cardClass}`}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-bold text-[var(--color-text)]">
                    📦 {batch.name}
                  </span>
                  <p className={`truncate text-sm ${mutedTextClass}`}>
                    Koszt {formatPln(batch.cost)} · Przychód netto{" "}
                    {formatPln(batch.netRevenue)} · {batch.saleCount}{" "}
                    {batch.saleCount === 1 ? "sprzedaż" : "sprzedaży"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`text-sm font-semibold ${
                      batch.breakEvenReached
                        ? "text-[var(--color-success)]"
                        : "text-[var(--color-warning)]"
                    }`}
                  >
                    {batch.breakEvenReached
                      ? `Próg osiągnięty (+${formatPln(batch.remaining)})`
                      : `Pozostało ${formatPln(batch.remaining)}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
