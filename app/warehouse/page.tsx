import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentEmployee, getEffectiveRoles, isIntakeOnly } from "@/lib/auth";
import {
  fetchLastActivityByItem,
  daysSince,
  PROCESSING_STATUSES,
} from "@/lib/item-aging";
import { loadPhotoAvailability } from "@/lib/item-photos";
import { WarehouseCards, type WarehouseCardItem } from "./WarehouseCards";

export default async function WarehousePage() {
  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);
  if (isIntakeOnly(roles)) redirect("/intake");
  const isAdmin = roles.has("admin");

  // Independent of each other — fire together instead of one after another.
  const [{ data: items }, { data: batchRows }] = await Promise.all([
    supabaseAdmin
      .from("items")
      .select(
        "id, internal_number, legacy_number, brand, model, size, condition, condition_detail, price, cost_price, status, batches(id, label)"
      )
      .is("deleted_at", null)
      .order("internal_number", { ascending: false }),
    // Every batch that exists, not just ones items happen to be linked to
    // (most items aren't linked to a batch yet) — otherwise the Partia
    // filter has nothing to show.
    supabaseAdmin.from("batches").select("label").order("label", { ascending: true }),
  ]);

  const rows = (items ?? []) as unknown as Omit<WarehouseCardItem, "hasPhoto">[];
  const ids = rows.map((row) => row.id);
  const allBatchLabels = (batchRows ?? [])
    .map((b) => b.label)
    .filter((v): v is string => !!v);

  // Just "does this item have a photo at all" — cheap, no signing calls.
  // The actual signed URLs are fetched lazily by the client, per-row, only
  // for cards that scroll into view (see app/api/item-thumbnails).
  // Neither depends on the other's result — only on `ids` — so run together.
  const [photoAvailability, lastActivityByItem] = await Promise.all([
    loadPhotoAvailability(ids),
    fetchLastActivityByItem(ids),
  ]);
  // This is a Server Component — it runs once per request on the server,
  // not repeatedly on the client, so Date.now() here isn't subject to the
  // client re-render purity concerns the react-hooks/purity rule targets.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  const cardItems: WarehouseCardItem[] = rows.map((row) => {
    const lastActivity = lastActivityByItem.get(row.id);
    const daysInStatus =
      PROCESSING_STATUSES.includes(row.status) && lastActivity
        ? daysSince(lastActivity, now)
        : null;

    return {
      ...row,
      hasPhoto: photoAvailability.has(row.id),
      daysInStatus,
    };
  });

  return (
    <div className="w-full flex-1 bg-[var(--color-bg)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-[var(--space-lg)] px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text)]">
          Magazyn
        </h1>
        <WarehouseCards
          items={cardItems}
          defaultStatusFilter=""
          isAdmin={isAdmin}
          allBatchLabels={allBatchLabels}
        />
      </div>
    </div>
  );
}
