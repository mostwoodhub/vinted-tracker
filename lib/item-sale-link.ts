import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Sales are recorded through a free-typed "legacy_shoe_id" field rather than
// a real foreign key into `items` — the sales form predates the batch/
// warehouse system and the two have never been linked. That's why adding a
// sale never moved the "Sprzedano X z N" counter on the item's batch: nothing
// ever set items.status = 'sold'.
//
// This matches by exact legacy_number — the same old/manual number a
// manager writes on the physical item at intake (see items.legacy_number),
// which is what the sales form's shoe-id field actually refers to.
// items.internal_number (this app's own 1,2,3… counter) is unrelated and
// essentially never coincides with an old shoe id, so it's not used here.
// Intentionally forgiving: legacy/bulk-imported sales, typos, ambiguous
// duplicate numbers, or shoe numbers with no matching item are silent
// no-ops. Recording the sale itself must never be blocked or fail because
// of this.
// Marks one specific item sold, bypassing legacy_number lookup entirely —
// used when the employee explicitly picked which physical pair sold from
// the ambiguous-number picker (see checkItemsByLegacyNumber), so there's
// nothing left to guess.
async function markItemSoldById(itemId: string): Promise<void> {
  try {
    const { data: item } = await supabaseAdmin
      .from("items")
      .select("id, status")
      .eq("id", itemId)
      .maybeSingle();
    if (!item || item.status === "sold") return;

    const { error: updateError } = await supabaseAdmin
      .from("items")
      .update({ status: "sold" })
      .eq("id", item.id);
    if (updateError) return;

    await supabaseAdmin.from("item_status_log").insert({
      item_id: item.id,
      from_status: item.status,
      to_status: "sold",
    });
  } catch (err) {
    console.error(`[item-sale-link] Nie udalo sie oznaczyc towaru jako sprzedany (id=${itemId}):`, err);
  }
}

export async function markItemSoldByShoeId(
  shoeId: string | null | undefined,
  resolvedItemId?: string | null
): Promise<void> {
  if (resolvedItemId) {
    await markItemSoldById(resolvedItemId);
    return;
  }
  if (!shoeId) return;
  // Most callers already pass one id at a time, but a few paths still hand
  // this a raw comma-joined multi-pair string — split defensively either way.
  const legacyNumbers = shoeId
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const legacyNumber of legacyNumbers) {
    try {
      const { data: candidates } = await supabaseAdmin
        .from("items")
        .select("id, status")
        .eq("legacy_number", legacyNumber);

      const rows = candidates ?? [];
      // legacy_number should be unique in practice — if more than one item
      // shares it (a duplicate manual entry), don't guess which one sold.
      if (rows.length !== 1) continue;

      const item = rows[0];
      if (item.status === "sold") continue;

      const { error: updateError } = await supabaseAdmin
        .from("items")
        .update({ status: "sold" })
        .eq("id", item.id);
      if (updateError) continue;

      await supabaseAdmin.from("item_status_log").insert({
        item_id: item.id,
        from_status: item.status,
        to_status: "sold",
      });
    } catch (err) {
      console.error(`[item-sale-link] Nie udalo sie oznaczyc towaru jako sprzedany (${legacyNumber}):`, err);
    }
  }
}
