import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all";
import { computeLinkedSales } from "@/lib/batch-stats";
import type { SaleRow } from "@/lib/sales-types";
import { BatchesSection, type BatchRow } from "./BatchesSection";
import { PhotoCropTool } from "./PhotoCropTool";
import { pageWrapClass } from "@/lib/ui-classes";

export default async function BatchesArchivePage() {
  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);

  if (!roles.has("admin")) {
    redirect("/warehouse");
  }

  // Independent of each other — fire together instead of one after another.
  const [{ data: expenseRows }, sales, { data: realBatchesRaw }, { data: itemBatchLinks }] =
    await Promise.all([
      // Cost source for batches that predate the real `batches` table — an
      // amount was logged in `expenses` against a letter label at purchase
      // time, with no real batch row ever created for it.
      supabaseAdmin
        .from("expenses")
        .select("batch_name, amount")
        .is("deleted_at", null)
        .not("batch_name", "is", null),
      fetchAllRows<
        Pick<SaleRow, "legacy_shoe_id" | "sale_price" | "fee_amount" | "vat_amount" | "income_tax_amount">
      >((from, to) =>
        supabaseAdmin
          .from("sales")
          .select("legacy_shoe_id, sale_price, fee_amount, vat_amount, income_tax_amount")
          .is("deleted_at", null)
          .not("legacy_shoe_id", "is", null)
          .order("created_at", { ascending: false })
          .range(from, to)
      ),
      supabaseAdmin
        .from("batches")
        .select(
          "id, label, batch_number, purchase_cost, purchase_location, quantity, sales_amount, sold_pairs"
        )
        .order("batch_number", { ascending: true }),
      supabaseAdmin
        .from("items")
        .select("batch_id, status")
        .not("batch_id", "is", null)
        .is("deleted_at", null),
    ]);

  const legacyCostByLabel = new Map<string, number>();
  for (const row of expenseRows ?? []) {
    if (!row.batch_name) continue;
    legacyCostByLabel.set(
      row.batch_name,
      (legacyCostByLabel.get(row.batch_name) ?? 0) + (row.amount ?? 0)
    );
  }

  const itemCountByBatch = new Map<string, number>();
  const soldCountByBatch = new Map<string, number>();
  for (const row of itemBatchLinks ?? []) {
    if (!row.batch_id) continue;
    itemCountByBatch.set(row.batch_id, (itemCountByBatch.get(row.batch_id) ?? 0) + 1);
    if (row.status === "sold") {
      soldCountByBatch.set(row.batch_id, (soldCountByBatch.get(row.batch_id) ?? 0) + 1);
    }
  }

  const realBatches: BatchRow[] = (realBatchesRaw ?? []).map((b) => {
    const linked = b.label ? computeLinkedSales(sales as SaleRow[], b.label) : { amount: 0, count: 0 };
    // A real batch row's own purchase_cost wins over any legacy expense
    // entry under the same label (it's the authoritative one once it
    // exists) — remove it from the legacy map so it isn't rendered twice.
    if (b.label) legacyCostByLabel.delete(b.label);
    return {
      id: b.id,
      label: b.label,
      batchNumber: b.batch_number,
      purchaseCost: b.purchase_cost,
      purchaseLocation: b.purchase_location,
      quantity: b.quantity,
      salesAmount: b.sales_amount,
      soldPairs: b.sold_pairs,
      itemCount: itemCountByBatch.get(b.id) ?? 0,
      soldCount: soldCountByBatch.get(b.id) ?? 0,
      linkedSalesAmount: linked.amount,
      linkedSalesCount: linked.count,
    };
  });

  const legacyOnlyBatches: BatchRow[] = Array.from(legacyCostByLabel.entries()).map(
    ([label, cost]) => {
      const linked = computeLinkedSales(sales as SaleRow[], label);
      return {
        id: null,
        label,
        batchNumber: null,
        purchaseCost: cost,
        purchaseLocation: null,
        quantity: null,
        salesAmount: null,
        soldPairs: null,
        itemCount: 0,
        soldCount: 0,
        linkedSalesAmount: linked.amount,
        linkedSalesCount: linked.count,
      };
    }
  );

  const batches = [...realBatches, ...legacyOnlyBatches].sort((a, b) =>
    a.label.localeCompare(b.label)
  );

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-[var(--space-xl)] px-6 py-12">
        <PhotoCropTool />
        <BatchesSection batches={batches} />
      </div>
    </div>
  );
}
