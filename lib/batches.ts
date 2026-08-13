import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function resolveBatchId(label: string): Promise<string | null> {
  if (!label) return null;

  const { data: existing } = await supabaseAdmin
    .from("batches")
    .select("id")
    .eq("label", label)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: maxRow } = await supabaseAdmin
    .from("batches")
    .select("batch_number")
    .order("batch_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextBatchNumber = (maxRow?.batch_number ?? 0) + 1;

  const { data: created, error } = await supabaseAdmin
    .from("batches")
    .insert({ label, batch_number: nextBatchNumber })
    .select("id")
    .single();

  if (error) throw error;

  return created.id;
}
