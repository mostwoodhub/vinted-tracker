import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import {
  fetchLastActivityByItem,
  daysSince,
  PROCESSING_STATUSES,
} from "@/lib/item-aging";
import { WarehouseCards, type WarehouseCardItem } from "@/app/warehouse/WarehouseCards";
import { headingClass, pageWrapClass } from "@/lib/ui-classes";

const PENDING_STATUSES = ["received", "photos_uploaded", "ai_card_ready"];

export default async function PendingPage() {
  const employee = await getCurrentEmployee();
  const isAdmin = getEffectiveRoles(employee).has("admin");

  const { data: items } = await supabaseAdmin
    .from("items")
    .select(
      "id, internal_number, brand, model, size, condition, condition_detail, price, cost_price, status, batches(id, label)"
    )
    .in("status", PENDING_STATUSES)
    .is("deleted_at", null)
    .order("internal_number", { ascending: false });

  const rows = (items ?? []) as unknown as Omit<WarehouseCardItem, "photoUrl">[];
  const ids = rows.map((row) => row.id);

  const photoUrlByItem = new Map<string, string>();

  if (ids.length > 0) {
    const { data: photos } = await supabaseAdmin
      .from("item_photos")
      .select("item_id, storage_path, is_working_photo")
      .in("item_id", ids)
      .order("uploaded_at", { ascending: true });

    const finalByItem = new Map<string, string>();
    const workingByItem = new Map<string, string>();

    for (const photo of photos ?? []) {
      if (photo.is_working_photo) {
        if (!workingByItem.has(photo.item_id)) {
          workingByItem.set(photo.item_id, photo.storage_path);
        }
      } else if (!finalByItem.has(photo.item_id)) {
        finalByItem.set(photo.item_id, photo.storage_path);
      }
    }

    const pathByItem = new Map<string, string>();
    for (const id of ids) {
      const path = finalByItem.get(id) ?? workingByItem.get(id);
      if (path) pathByItem.set(id, path);
    }

    const paths = Array.from(pathByItem.values());
    if (paths.length > 0) {
      const { data: signed } = await supabaseAdmin.storage
        .from("item-photos")
        .createSignedUrls(paths, 60 * 60);

      const signedUrlByPath = new Map<string, string>();
      for (const entry of signed ?? []) {
        if (entry.signedUrl) {
          signedUrlByPath.set(entry.path ?? "", entry.signedUrl);
        }
      }

      for (const [itemId, path] of pathByItem) {
        const url = signedUrlByPath.get(path);
        if (url) photoUrlByItem.set(itemId, url);
      }
    }
  }

  const lastActivityByItem = await fetchLastActivityByItem(ids);
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
      photoUrl: photoUrlByItem.get(row.id) ?? null,
      daysInStatus,
    };
  });

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-[var(--space-lg)] px-6 py-12">
        <h1 className={headingClass}>Oczekujące</h1>
        <WarehouseCards items={cardItems} defaultStatusFilter="" isAdmin={isAdmin} />
      </div>
    </div>
  );
}
