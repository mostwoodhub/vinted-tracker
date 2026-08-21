import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all";
import { computeLinkedSales } from "@/lib/batch-stats";
import type { SaleRow } from "@/lib/sales-types";
import { IntakeStatsSection, type IntakeItem } from "./IntakeStatsSection";
import { warsawDateString } from "@/lib/warsaw-time";
import { daysBetween } from "@/lib/day-buckets";
import { computePipelineAging, type PipelineStageRow } from "@/lib/pipeline-aging";
import { cardClass, headingClass, mutedTextClass, pageWrapClass } from "@/lib/ui-classes";

const PROCESSING_STATUSES = [
  "received",
  "photos_uploaded",
  "ai_card_ready",
  "ready_to_publish",
];

function formatPln(value: number) {
  return `${value.toFixed(2)} zł`;
}

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={cardClass}>
      <p className={`text-xs ${mutedTextClass}`}>{label}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">
        {value}
      </p>
    </div>
  );
}

function PipelineAgingTable({ rows }: { rows: PipelineStageRow[] }) {
  return (
    <div className="flex flex-col gap-[var(--gap-default)]">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Gdzie utknął towar
        </h2>
        <p className={`text-xs ${mutedTextClass}`}>
          Liczone od ostatniej zmiany statusu (albo przyjęcia, jeśli status
          nigdy się nie zmienił). &bdquo;Powyżej progu&rdquo; = leży dłużej
          niż zwykle zajmuje ten etap.
        </p>
      </div>
      <div className={`overflow-x-auto ${cardClass} !p-0`}>
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className={`text-xs ${mutedTextClass}`}>
            <tr>
              <th className="px-4 py-3 font-medium">Etap</th>
              <th className="px-4 py-3 font-medium">Liczba</th>
              <th className="px-4 py-3 font-medium">Mediana dni</th>
              <th className="px-4 py-3 font-medium">Próg</th>
              <th className="px-4 py-3 font-medium">Powyżej progu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.status}
                className="[&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--color-bg)]"
              >
                <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                  {row.label}
                </td>
                <td className="px-4 py-3 text-[var(--color-text)]">{row.count}</td>
                <td className="px-4 py-3 text-[var(--color-text)]">
                  {row.medianDays ?? "—"}
                </td>
                <td className={`px-4 py-3 ${mutedTextClass}`}>{row.threshold} dni</td>
                <td
                  className={`px-4 py-3 font-medium ${
                    row.stuckCount > 0
                      ? "text-[var(--color-danger)]"
                      : "text-[var(--color-success)]"
                  }`}
                >
                  {row.stuckCount}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className={`px-4 py-6 text-center text-sm ${mutedTextClass}`}>
                  Brak towaru w trakcie obróbki.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);

  if (!roles.has("admin")) {
    redirect("/warehouse");
  }

  // Independent of each other — fire together instead of one after another.
  const [
    { data: items },
    { data: batches },
    { data: expenseRows },
    sales,
    { data: employees },
    { data: photoLog },
    statusLog,
  ] = await Promise.all([
      supabaseAdmin
        .from("items")
        .select("id, status, price, cost_price, batch_id, created_by, created_at")
        .is("deleted_at", null),
      supabaseAdmin
        .from("batches")
        .select("id, label, batch_number, purchase_cost, quantity, sales_amount, sold_pairs")
        .order("batch_number", { ascending: true }),
      // Batches that predate the real `batches` table — a cost was logged in
      // `expenses` against a letter label at purchase time, no real row here.
      supabaseAdmin
        .from("expenses")
        .select("batch_name, amount")
        .is("deleted_at", null)
        .not("batch_name", "is", null),
      // Old batches were bought under the legacy system and never got real
      // rows in `items` — sales against them only ever landed in the `sales`
      // table, matched by the letter prefix of their old shoe id (e.g.
      // "Q16362"), never by items.batch_id. Without this, every legacy batch
      // shows 0/0 sold here forever, since nothing in `items` ever links to it.
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
        .from("employees")
        .select("id, full_name, created_at")
        .order("created_at", { ascending: true }),
      // "Photographing" = the received → photos_uploaded transition, the
      // one point in the pipeline after intake that's attributed to a
      // specific employee (changed_by, wired up alongside this feature).
      supabaseAdmin
        .from("item_status_log")
        .select("changed_by, changed_at")
        .eq("to_status", "photos_uploaded")
        .not("changed_by", "is", null),
      // Every status transition is logged (see items/[id]/actions.ts,
      // app/drafts/actions.ts, items/[id]/ai-card.ts, item-sale-link.ts) —
      // an item's latest log row is exactly when it entered its current
      // status, which is what "how long has this been stuck here" needs.
      fetchAllRows<{ item_id: string; changed_at: string | null }>((from, to) =>
        supabaseAdmin
          .from("item_status_log")
          .select("item_id, changed_at")
          .range(from, to)
      ),
    ]);

  const todayWarsaw = warsawDateString(new Date());

  // Two employees can share a full_name (e.g. two people both named
  // "Daria") — the id is the real identity, so a name collision needs a
  // disambiguating suffix everywhere the name is displayed, or the two
  // would silently merge into one row/series and double-count.
  const nameCounts = new Map<string, number>();
  for (const e of employees ?? []) {
    nameCounts.set(e.full_name, (nameCounts.get(e.full_name) ?? 0) + 1);
  }
  const nameOrdinal = new Map<string, number>();
  const displayNameByEmployeeId = new Map<string, string>();
  for (const e of employees ?? []) {
    if ((nameCounts.get(e.full_name) ?? 0) <= 1) {
      displayNameByEmployeeId.set(e.id, e.full_name);
    } else {
      const n = (nameOrdinal.get(e.full_name) ?? 0) + 1;
      nameOrdinal.set(e.full_name, n);
      displayNameByEmployeeId.set(e.id, `${e.full_name} #${n}`);
    }
  }

  // Full history, not just today — the period switcher (day/week/month)
  // in IntakeStatsSection does its own client-side filtering, same pattern
  // as the other pages' PeriodFilterControl.
  const intakeItems: IntakeItem[] = (items ?? [])
    .filter((item) => item.created_by && item.created_at)
    .map((item) => ({ employeeId: item.created_by as string, createdAt: item.created_at as string }));

  const displayNames = Object.fromEntries(displayNameByEmployeeId);

  const photoItems: IntakeItem[] = (photoLog ?? [])
    .filter((log) => log.changed_by && log.changed_at)
    .map((log) => ({ employeeId: log.changed_by as string, createdAt: log.changed_at as string }));

  const rows = items ?? [];

  const nowIso = new Date().toISOString();
  const lastChangedAtByItem = new Map<string, string>();
  for (const log of statusLog) {
    if (!log.changed_at) continue;
    const prev = lastChangedAtByItem.get(log.item_id);
    if (!prev || log.changed_at > prev) lastChangedAtByItem.set(log.item_id, log.changed_at);
  }

  const pipelineRows = computePipelineAging(
    rows
      .filter((item) => item.status !== "sold")
      .map((item) => {
        const since = lastChangedAtByItem.get(item.id) ?? item.created_at ?? nowIso;
        return { status: item.status, daysInStage: daysBetween(since, nowIso) };
      })
  );

  const inStock = rows.filter((item) => item.status !== "sold").length;
  const processing = rows.filter((item) =>
    PROCESSING_STATUSES.includes(item.status)
  ).length;
  const published = rows.filter((item) => item.status === "published").length;
  const sold = rows.filter((item) => item.status === "sold").length;

  const unsoldItems = rows.filter((item) => item.status !== "sold");
  const warehouseCost = unsoldItems.reduce(
    (sum, item) => sum + (item.cost_price ?? 0),
    0
  );
  const projectedRevenue = unsoldItems.reduce(
    (sum, item) => sum + (item.price ?? 0),
    0
  );
  const projectedRevenueDiscounted = projectedRevenue * 0.9;

  const legacyCostByLabel = new Map<string, number>();
  for (const row of expenseRows ?? []) {
    if (!row.batch_name) continue;
    legacyCostByLabel.set(
      row.batch_name,
      (legacyCostByLabel.get(row.batch_name) ?? 0) + (row.amount ?? 0)
    );
  }
  for (const b of batches ?? []) {
    if (b.label) legacyCostByLabel.delete(b.label);
  }

  const batchRows = (batches ?? []).map((batch) => {
    const batchItems = rows.filter((item) => item.batch_id === batch.id);
    const soldItemsCount = batchItems.filter((item) => item.status === "sold").length;

    const linked = batch.label
      ? computeLinkedSales(sales as SaleRow[], batch.label)
      : { amount: 0, count: 0 };

    const totalCount = Math.max(batch.quantity ?? 0, batchItems.length);
    const manualPlusLinkedSold = (batch.sold_pairs ?? 0) + linked.count;
    const soldCount = Math.max(soldItemsCount, manualPlusLinkedSold);
    const remainingCount = Math.max(0, totalCount - soldCount);
    const soldRevenue = (batch.sales_amount ?? 0) + linked.amount;

    const purchaseCost = batch.purchase_cost;
    const breakEven =
      purchaseCost == null
        ? null
        : soldRevenue >= purchaseCost
          ? { reached: true, amount: soldRevenue - purchaseCost }
          : { reached: false, amount: purchaseCost - soldRevenue };

    return {
      id: batch.id as string | null,
      label: batch.label ?? String(batch.batch_number),
      purchaseCost,
      totalCount,
      soldCount,
      remainingCount,
      soldRevenue,
      breakEven,
    };
  });

  const legacyOnlyRows = Array.from(legacyCostByLabel.entries()).map(([label, cost]) => {
    const linked = computeLinkedSales(sales as SaleRow[], label);
    const breakEven =
      linked.amount >= cost
        ? { reached: true, amount: linked.amount - cost }
        : { reached: false, amount: cost - linked.amount };
    return {
      id: null as string | null,
      label,
      purchaseCost: cost,
      totalCount: linked.count,
      soldCount: linked.count,
      remainingCount: 0,
      soldRevenue: linked.amount,
      breakEven,
    };
  });

  const allBatchRows = [...batchRows, ...legacyOnlyRows].sort((a, b) =>
    a.label.localeCompare(b.label)
  );

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-[var(--space-xl)] px-6 py-12">
        <h1 className={headingClass}>Panel analityczny</h1>

        <div className="grid grid-cols-2 gap-[var(--space-md)] sm:grid-cols-4">
          <Tile label="W magazynie" value={inStock} />
          <Tile label="W trakcie obróbki" value={processing} />
          <Tile label="Opublikowano" value={published} />
          <Tile label="Sprzedano" value={sold} />
        </div>

        <PipelineAgingTable rows={pipelineRows} />

        <IntakeStatsSection items={intakeItems} displayNames={displayNames} todayWarsaw={todayWarsaw} />

        <IntakeStatsSection
          items={photoItems}
          displayNames={displayNames}
          todayWarsaw={todayWarsaw}
          heading="Towary sfotografowane wg pracownika"
          caveatText="Liczone od 19.08.2026 — starsze zdjęcia nie mają zapisanego, kto je zrobił."
          emptyStateText="Nikt nie sfotografował towaru w tym okresie."
          chartTitle="Chronologia fotografowania towarów"
          chartSubtitle="Każda kropka to jeden sfotografowany towar, z dokładnym czasem."
        />

        <div className="grid grid-cols-1 gap-[var(--space-md)] sm:grid-cols-3">
          <Tile
            label="Koszt własny magazynu"
            value={formatPln(warehouseCost)}
          />
          <Tile
            label="Prognozowany przychód"
            value={formatPln(projectedRevenue)}
          />
          <Tile
            label="Prognozowany przychód (rabat 10%)"
            value={formatPln(projectedRevenueDiscounted)}
          />
        </div>

        <div className="flex flex-col gap-[var(--gap-default)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            Partie
          </h2>
          <div className={`overflow-x-auto ${cardClass} !p-0`}>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead
                className={`text-xs ${mutedTextClass}`}
              >
                <tr>
                  <th className="px-4 py-3 font-medium">Partia</th>
                  <th className="px-4 py-3 font-medium">Koszt zakupu</th>
                  <th className="px-4 py-3 font-medium">
                    Sprzedano / zostało
                  </th>
                  <th className="px-4 py-3 font-medium">
                    Przychód ze sprzedanych
                  </th>
                  <th className="px-4 py-3 font-medium">Próg rentowności</th>
                </tr>
              </thead>
              <tbody>
                {allBatchRows.map((batch) => (
                  <tr
                    key={batch.id ?? batch.label}
                    className="[&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--color-bg)]"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                      {batch.id ? (
                        <Link href={`/batches/${batch.id}`} className="underline-offset-2 hover:underline">
                          {batch.label}
                        </Link>
                      ) : (
                        batch.label
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)]">
                      {batch.purchaseCost != null
                        ? formatPln(batch.purchaseCost)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)]">
                      {batch.soldCount} / {batch.remainingCount}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)]">
                      {formatPln(batch.soldRevenue)}
                    </td>
                    <td className="px-4 py-3">
                      {batch.breakEven == null ? (
                        "—"
                      ) : batch.breakEven.reached ? (
                        <span className="text-[var(--color-success)]">
                          Osiągnięty (+{formatPln(batch.breakEven.amount)})
                        </span>
                      ) : (
                        <span className="text-[var(--color-warning)]">
                          Brakuje {formatPln(batch.breakEven.amount)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}

                {allBatchRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className={`px-4 py-6 text-center text-sm ${mutedTextClass}`}>
                      Brak partii.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
