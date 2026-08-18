// One-time backfill: sets items.batch_id from the leading letters of
// items.legacy_number, for items that have a legacy_number but no batch_id
// yet. Only matches against batches that already exist — never creates one.
// Run: node scripts/backfill-batch-from-legacy-number.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnvLocal() {
  const env = {};
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function deriveBatchLabel(legacyNumber) {
  if (!legacyNumber) return null;
  const match = legacyNumber.trim().match(/^([A-Za-z]+)\d+$/);
  return match ? match[1] : null;
}

const env = loadEnvLocal();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: items, error: itemsError } = await supabase
  .from("items")
  .select("id, legacy_number, batch_id")
  .is("deleted_at", null)
  .is("batch_id", null)
  .not("legacy_number", "is", null);
if (itemsError) throw itemsError;

const { data: batches, error: batchesError } = await supabase
  .from("batches")
  .select("id, label");
if (batchesError) throw batchesError;

const batchIdByLabel = new Map(batches.map((b) => [b.label, b.id]));

const updates = [];
for (const item of items) {
  const label = deriveBatchLabel(item.legacy_number);
  if (!label) continue;
  const batchId = batchIdByLabel.get(label);
  if (!batchId) continue;
  updates.push({ id: item.id, legacyNumber: item.legacy_number, label, batchId });
}

console.log(`Found ${updates.length} item(s) to update:`);
console.table(updates.map((u) => ({ legacy_number: u.legacyNumber, batch: u.label })));

for (const u of updates) {
  const { error } = await supabase.from("items").update({ batch_id: u.batchId }).eq("id", u.id);
  if (error) {
    console.error(`FAILED for item ${u.id} (${u.legacyNumber}):`, error.message);
  }
}

console.log(`Done. Updated ${updates.length} item(s).`);
