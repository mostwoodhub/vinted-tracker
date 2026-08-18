import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all";
import { computeLinkedSales } from "@/lib/batch-stats";
import type { SaleRow } from "@/lib/sales-types";
import { IntakeFrequencyChart, type HourlyIntakeRow } from "./IntakeFrequencyChart";
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

// "Today" by the calendar date in Warsaw, not the server's UTC clock —
// Vercel functions run in UTC, so for the first 1-2 hours of every Warsaw
// day a naive `new Date().toISOString().slice(0,10)` would still report
// yesterday's date.
function warsawDateString(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(date);
}

// sv-SE reliably formats hour 0 as "00" rather than the "24" some locales
// produce for hour12:false at midnight.
function warsawHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      hour12: false,
    }).format(date)
  );
}

export default async function DashboardPage() {
  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);

  if (!roles.has("admin")) {
    redirect("/warehouse");
  }

  // Independent of each other — fire together instead of one after another.
  const [{ data: items }, { data: batches }, { data: expenseRows }, sales, { data: employees }] =
    await Promise.all([
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
      supabaseAdmin.from("employees").select("id, full_name"),
    ]);

  const todayWarsaw = warsawDateString(new Date());
  const nameByEmployeeId = new Map((employees ?? []).map((e) => [e.id, e.full_name]));
  const todaysIntakeByEmployee = new Map<string, number>();
  for (const item of items ?? []) {
    if (!item.created_by || !item.created_at) continue;
    if (warsawDateString(new Date(item.created_at)) !== todayWarsaw) continue;
    todaysIntakeByEmployee.set(
      item.created_by,
      (todaysIntakeByEmployee.get(item.created_by) ?? 0) + 1
    );
  }
  const todaysIntakeRows = Array.from(todaysIntakeByEmployee.entries())
    .map(([employeeId, count]) => ({
      name: nameByEmployeeId.get(employeeId) ?? "Nieznany",
      count,
    }))
    .sort((a, b) => b.count - a.count);

  // Same-order employee list drives both the stacked bar colors and the
  // legend — fixed by descending today's total, so the busiest person's
  // color stays stable as the day goes on rather than shuffling.
  const activeEmployeeNames = todaysIntakeRows.map((r) => r.name);
  const hourlyCounts = new Map<number, Map<string, number>>();
  for (const item of items ?? []) {
    if (!item.created_by || !item.created_at) continue;
    const createdAt = new Date(item.created_at);
    if (warsawDateString(createdAt) !== todayWarsaw) continue;
    const hour = warsawHour(createdAt);
    const name = nameByEmployeeId.get(item.created_by) ?? "Nieznany";
    const perEmployee = hourlyCounts.get(hour) ?? new Map<string, number>();
    perEmployee.set(name, (perEmployee.get(name) ?? 0) + 1);
    hourlyCounts.set(hour, perEmployee);
  }
  const hourlyIntakeData: HourlyIntakeRow[] = Array.from({ length: 24 }, (_, hour) => {
    const perEmployee = hourlyCounts.get(hour);
    const row: HourlyIntakeRow = { hour: `${String(hour).padStart(2, "0")}:00` };
    for (const name of activeEmployeeNames) {
      row[name] = perEmployee?.get(name) ?? 0;
    }
    return row;
  });

  const rows = items ?? [];

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

        <div className="flex flex-col gap-[var(--gap-default)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            Dzisiaj: towary przyjęte wg pracownika
          </h2>
          <p className={`text-xs ${mutedTextClass}`}>
            Liczone tylko od teraz — starsze towary nie mają zapisanego, kto je przyjął.
          </p>
          <div className={`overflow-x-auto ${cardClass} !p-0`}>
            <table className="w-full min-w-[320px] text-left text-sm">
              <tbody>
                {todaysIntakeRows.map((row) => (
                  <tr
                    key={row.name}
                    className="[&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--color-bg)]"
                  >
                    <td className="px-4 py-3 text-[var(--color-text)]">{row.name}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--color-text)]">
                      {row.count}
                    </td>
                  </tr>
                ))}
                {todaysIntakeRows.length === 0 && (
                  <tr>
                    <td className={`px-4 py-6 text-center text-sm ${mutedTextClass}`}>
                      Dzisiaj nikt jeszcze nie przyjął towaru.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <IntakeFrequencyChart data={hourlyIntakeData} employeeNames={activeEmployeeNames} />
        </div>

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
