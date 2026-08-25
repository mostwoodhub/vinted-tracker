import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendTelegramMessage } from "@/lib/telegram";

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

// Reduces whatever was typed/derived down to just its leading letters before
// it's ever used to look up or create a batch — a "Partia" field mistake
// (someone pastes a full item number like "R15583" instead of just "R")
// used to create a brand new batch named after the whole typo. This is the
// one choke point every caller goes through (manual entry and the
// legacy-number-derived fallback alike), so that can't happen again no
// matter what the raw input was. A value with no leading letters at all
// (e.g. a pasted pure-digit number) has nothing to derive a batch from and
// resolves to no batch — same as leaving the field blank.
export function normalizeBatchLabel(label: string): string | null {
  const match = label.trim().match(/^([A-Za-z]+)/);
  return match ? match[1] : null;
}

export async function resolveBatchId(label: string): Promise<string | null> {
  const normalized = normalizeBatchLabel(label);
  if (!normalized) return null;

  const { data: existing } = await supabaseAdmin
    .from("batches")
    .select("id")
    .eq("label", normalized)
    .maybeSingle();

  if (existing) return existing.id;

  const nextBatchNumber = await getNextBatchNumber();

  const { data: created, error } = await supabaseAdmin
    .from("batches")
    .insert({ label: normalized, batch_number: nextBatchNumber })
    .select("id")
    .single();

  if (error) throw error;

  // A brand-new batch always starts with no purchase cost — nothing knows
  // to ask for it, so it silently sits invisible in every cost/payback view
  // until someone happens to notice (this is exactly how batch "P" went
  // unnoticed for months). A one-line heads-up here is enough to close that
  // gap without adding friction to the intake form itself.
  await sendTelegramMessage(
    `🆕 <b>Nowa partia "${normalized}"</b> utworzona automatycznie przy przyjęciu — nie ma jeszcze wpisanego kosztu zakupu. Uzupełnij ją w sekcji "Partie" na Dashboardzie, żeby nie zgubiła się w statystykach.`
  );

  return created.id;
}
