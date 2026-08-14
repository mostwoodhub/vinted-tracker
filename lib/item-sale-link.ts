import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

type ItemCandidate = {
  id: string;
  status: string | null;
  batches: { label: string | null } | { label: string | null }[] | null;
};

function batchLabelOf(item: ItemCandidate): string | null {
  const b = item.batches;
  if (!b) return null;
  return Array.isArray(b) ? (b[0]?.label ?? null) : b.label;
}

// Sales are recorded through a free-typed "legacy_shoe_id" field (e.g.
// "ZA16678" = batch label "ZA" + item internal_number 16678) rather than a
// real foreign key into `items` — the sales form predates the batch/
// warehouse system and the two have never been linked. That's why adding a
// sale never moved the "Sprzedano X z N" counter on the item's batch: nothing
// ever set items.status = 'sold'.
//
// This does a best-effort match — parse the leading letters as a batch
// label and the trailing digits as internal_number — and marks that item
// sold if found. It's intentionally forgiving: legacy/bulk-imported sales,
// typos, or shoe numbers with no matching item are silent no-ops. Recording
// the sale itself must never be blocked or fail because of this.
export async function markItemSoldByShoeId(shoeId: string | null | undefined): Promise<void> {
  if (!shoeId) return;
  const match = shoeId.trim().match(/^([A-Za-z]*)(\d+)$/);
  if (!match) return;
  const [, prefix, numberStr] = match;
  const internalNumber = Number(numberStr);
  if (!Number.isInteger(internalNumber)) return;

  try {
    const { data: candidates } = await supabaseAdmin
      .from("items")
      .select("id, status, batches(label)")
      .eq("internal_number", internalNumber);

    const rows = (candidates ?? []) as unknown as ItemCandidate[];
    if (rows.length === 0) return;

    // internal_number should be globally unique, so one candidate is the
    // normal case — but if several batches happen to share numbering, only
    // trust a batch-label match rather than guessing.
    const item =
      rows.length === 1
        ? rows[0]
        : rows.find((row) => batchLabelOf(row) === (prefix || null));
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
    console.error(`[item-sale-link] Nie udalo sie oznaczyc towaru jako sprzedany (${shoeId}):`, err);
  }
}
