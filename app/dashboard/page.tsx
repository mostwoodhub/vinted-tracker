import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
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

export default async function DashboardPage() {
  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);

  if (!roles.has("admin")) {
    redirect("/warehouse");
  }

  const { data: items } = await supabaseAdmin
    .from("items")
    .select("id, status, price, cost_price, batch_id");

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

  const { data: batches } = await supabaseAdmin
    .from("batches")
    .select("id, label, batch_number, purchase_cost")
    .order("batch_number", { ascending: true });

  const batchRows = (batches ?? []).map((batch) => {
    const batchItems = rows.filter((item) => item.batch_id === batch.id);
    const soldItems = batchItems.filter((item) => item.status === "sold");
    const remainingCount = batchItems.length - soldItems.length;
    const soldRevenue = soldItems.reduce(
      (sum, item) => sum + (item.price ?? 0),
      0
    );

    const purchaseCost = batch.purchase_cost;
    const breakEven =
      purchaseCost == null
        ? null
        : soldRevenue >= purchaseCost
          ? { reached: true, amount: soldRevenue - purchaseCost }
          : { reached: false, amount: purchaseCost - soldRevenue };

    return {
      id: batch.id,
      label: batch.label ?? String(batch.batch_number),
      purchaseCost,
      totalCount: batchItems.length,
      soldCount: soldItems.length,
      remainingCount,
      soldRevenue,
      breakEven,
    };
  });

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
                {batchRows.map((batch) => (
                  <tr
                    key={batch.id}
                    className="[&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--color-bg)]"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                      <Link href={`/batches/${batch.id}`} className="underline-offset-2 hover:underline">
                        {batch.label}
                      </Link>
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

                {batchRows.length === 0 && (
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
