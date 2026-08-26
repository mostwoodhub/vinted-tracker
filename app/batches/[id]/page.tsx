import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatItemNumber } from "@/lib/item-number";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { BatchCostForm } from "./BatchCostForm";
import { cardClass, headingClass, mutedTextClass, pageWrapClass } from "@/lib/ui-classes";

export default async function BatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // The only in-app link here (redirected to after creating a batch from
  // /batches-archive) is already admin-only, but the route itself had no
  // check of its own — purchase cost and per-item cost prices were reachable
  // by any logged-in employee who typed the URL directly.
  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);
  if (!roles.has("admin")) {
    redirect("/warehouse");
  }

  // Both only need `id`, not each other's result — fire together.
  const [{ data: batch }, { data: items }] = await Promise.all([
    supabaseAdmin
      .from("batches")
      .select(
        "id, label, batch_number, purchase_cost, purchase_location, quantity, sales_amount, sold_pairs"
      )
      .eq("id", id)
      .single(),
    supabaseAdmin
      .from("items")
      .select("id, internal_number, legacy_number, brand, size, cost_price, status")
      .eq("batch_id", id)
      .is("deleted_at", null)
      .order("internal_number", { ascending: false }),
  ]);

  if (!batch) notFound();

  const rows = items ?? [];
  const unpricedCount = rows.filter((item) => item.cost_price == null).length;
  const soldCount = rows.filter((item) => item.status === "sold").length;

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-[var(--space-lg)] px-6 py-12">
        <h1 className={headingClass}>
          Partia {batch.label ?? batch.batch_number}
        </h1>

        <BatchCostForm
          batchId={batch.id}
          label={batch.label}
          purchaseCost={batch.purchase_cost}
          purchaseLocation={batch.purchase_location}
          quantity={batch.quantity}
          salesAmount={batch.sales_amount}
          soldPairs={batch.sold_pairs}
          itemCount={rows.length}
          soldCount={soldCount}
          unpricedCount={unpricedCount}
        />

        <div className={`overflow-x-auto ${cardClass} !p-0`}>
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className={`text-xs ${mutedTextClass}`}>
              <tr>
                <th className="px-3 py-2 font-medium">Nr</th>
                <th className="px-3 py-2 font-medium">Marka</th>
                <th className="px-3 py-2 font-medium">Rozmiar</th>
                <th className="px-3 py-2 font-medium">Koszt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr
                  key={item.id}
                  className="[&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--color-bg)]"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/items/${item.id}`}
                      className="font-medium text-[var(--color-text)] underline-offset-2 hover:underline"
                    >
                      {formatItemNumber(batch.label, item.internal_number, item.legacy_number)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-[var(--color-text)]">{item.brand ?? "—"}</td>
                  <td className="px-3 py-2 text-[var(--color-text)]">{item.size ?? "—"}</td>
                  <td className="px-3 py-2 text-[var(--color-text)]">
                    {item.cost_price != null ? `${item.cost_price} zł` : "—"}
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className={`px-3 py-6 text-center text-sm ${mutedTextClass}`}>
                    Brak towarów w tej partii.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className={`text-xs ${mutedTextClass}`}>
          Koszt pojedynczego towaru można edytować w{" "}
          <Link href="/warehouse" className="underline underline-offset-2">
            Magazynie
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
