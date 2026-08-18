import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Every batch is named after the leading letters of the old/manual numbering
// scheme (e.g. "R15950" belongs to batch "R") — so whenever an item has a
// legacy number but no explicitly chosen Partia, the batch can be derived
// instead of asked for. Numbers with no letters (plain digits, e.g. "8008")
// have no batch to derive and are left unassigned.
export function deriveBatchLabelFromLegacyNumber(
  legacyNumber: string | null | undefined
): string | null {
  if (!legacyNumber) return null;
  const match = legacyNumber.trim().match(/^([A-Za-z]+)\d+$/);
  return match ? match[1] : null;
}

export async function getNextBatchNumber(): Promise<number> {
  const { data: maxRow } = await supabaseAdmin
    .from("batches")
    .select("batch_number")
    .order("batch_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (maxRow?.batch_number ?? 0) + 1;
}

export async function resolveBatchId(label: string): Promise<string | null> {
  if (!label) return null;

  const { data: existing } = await supabaseAdmin
    .from("batches")
    .select("id")
    .eq("label", label)
    .maybeSingle();

  if (existing) return existing.id;

  const nextBatchNumber = await getNextBatchNumber();

  const { data: created, error } = await supabaseAdmin
    .from("batches")
    .insert({ label, batch_number: nextBatchNumber })
    .select("id")
    .single();

  if (error) throw error;

  return created.id;
}
