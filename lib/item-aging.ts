import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Statuses where an item is still "in process" (not yet listed/sold) — these
// are the ones worth flagging if nothing has happened for a while.
export const PROCESSING_STATUSES = ["received", "photos_uploaded", "ai_card_ready"];
export const STALE_THRESHOLD_DAYS = 30;

// Best-effort "last activity" per item, based on item_status_log. Items with
// no log rows at all (e.g. never progressed past their initial intake before
// this tracking existed) are simply left out of the map — callers should
// treat a missing entry as "unknown", not "fresh".
export async function fetchLastActivityByItem(
  itemIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (itemIds.length === 0) return map;

  // .in("item_id", itemIds) puts every id straight into the request URL —
  // past ~200 items that blows the 16KB header limit and the query fails
  // outright (HeadersOverflowError), not just slowly. Chunking keeps each
  // request's URL short regardless of how large the warehouse grows. Each
  // item's log rows are entirely within one chunk (chunking splits by id,
  // not by time), so per-chunk ordering still preserves "most recent wins"
  // below even though chunks aren't merged in global order.
  const ID_CHUNK_SIZE = 150;
  const idChunks: string[][] = [];
  for (let i = 0; i < itemIds.length; i += ID_CHUNK_SIZE) {
    idChunks.push(itemIds.slice(i, i + ID_CHUNK_SIZE));
  }
  const chunkResults = await Promise.all(
    idChunks.map((chunk) =>
      supabaseAdmin
        .from("item_status_log")
        .select("item_id, changed_at")
        .in("item_id", chunk)
        .order("changed_at", { ascending: false })
    )
  );

  for (const { data } of chunkResults) {
    for (const row of data ?? []) {
      if (!map.has(row.item_id)) map.set(row.item_id, row.changed_at);
    }
  }

  return map;
}

export function daysSince(dateIso: string, nowMs: number): number {
  return Math.floor((nowMs - new Date(dateIso).getTime()) / (24 * 60 * 60 * 1000));
}
