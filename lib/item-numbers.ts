import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatItemNumber } from "@/lib/item-number";

type BatchRel = { label: string | null } | { label: string | null }[] | null;

function batchLabelOf(batches: BatchRel): string | null {
  if (!batches) return null;
  return Array.isArray(batches) ? (batches[0]?.label ?? null) : batches.label;
}

// Maps every formatted item number (batch letter + internal_number, e.g.
// "ZA16678") to its current status. Used on the sale form to give live
// feedback on whether a typed "Numer obuwia" actually matches a real
// warehouse item — the field itself stays free text on purpose (plenty of
// sales are for things that were never run through Intake at all), this
// just makes it visible instead of a silent no-op mismatch.
export async function getItemStatusByNumber(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin.from("items").select("internal_number, status, batches(label)");

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    const number = formatItemNumber(batchLabelOf(row.batches as BatchRel), row.internal_number);
    map[number] = row.status ?? "";
  }
  return map;
}
