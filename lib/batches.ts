import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

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
