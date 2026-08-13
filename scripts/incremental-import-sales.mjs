// One-off incremental re-import: fetch all `sales` rows from the old
// Supabase project, diff against the ids already present in the new
// project's `sales` table, and insert ONLY the genuinely-new rows.
//
// Uses a plain insert() (not upsert) after client-side dedup by id, so the
// count of inserted rows is an exact, honest count of new sales.
//
// Requires in .env.local: OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_KEY,
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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

const env = loadEnvLocal();

const REQUIRED = [
  "OLD_SUPABASE_URL",
  "OLD_SUPABASE_SERVICE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];
for (const key of REQUIRED) {
  if (!env[key]) {
    console.error(`Missing ${key} in .env.local`);
    process.exit(1);
  }
}

const oldClient = createClient(env.OLD_SUPABASE_URL, env.OLD_SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});
const newClient = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const PAGE_SIZE = 1000;
const INSERT_BATCH_SIZE = 500;

async function fetchAll(client, table, columns, orderColumn) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Fetching ${table} failed: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function transformSale(row) {
  return {
    id: row.id,
    sale_date: row.date,
    platform: row.platform,
    legacy_shoe_id: row.shoe_id,
    buyer_name: row.buyer_name,
    cost_price: row.cost,
    sale_price: row.price,
    country: row.country,
    fee_percent: row.fee_percent,
    fee_amount: row.fee,
    vat_rate: row.vat_rate,
    vat_amount: row.vat_amount,
    vat_mode: row.vat_mode,
    income_tax_applied: row.apply_income_tax,
    income_tax_amount: row.income_tax,
    net_profit: row.net,
    account_name: row.account,
    quantity: row.quantity,
    confirmed: row.confirmed,
    photo_url: row.photo_url,
    photo_urls: row.photo_urls,
    label_url: row.label_url,
    label_url2: row.label_url2,
    label_filename: row.label_filename,
    label_filename2: row.label_filename2,
    items: row.items,
    legacy_user_id: row.user_id,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
  };
}

async function main() {
  console.log("Fetching existing sale ids from new project...");
  const existingRows = await fetchAll(newClient, "sales", "id", "id");
  const existingIds = new Set(existingRows.map((r) => r.id));
  console.log(`  ${existingIds.size} existing ids`);

  console.log("Fetching all sales from old project...");
  const oldRows = await fetchAll(oldClient, "sales", "*", "id");
  console.log(`  fetched ${oldRows.length} rows`);

  const newRows = oldRows.filter((r) => !existingIds.has(r.id)).map(transformSale);
  console.log(`  ${newRows.length} rows are new (not present in new table)`);

  if (newRows.length === 0) {
    console.log("\nNothing to insert. New rows added: 0");
    return;
  }

  let inserted = 0;
  const failures = [];
  for (let i = 0; i < newRows.length; i += INSERT_BATCH_SIZE) {
    const batch = newRows.slice(i, i + INSERT_BATCH_SIZE);
    const { error } = await newClient.from("sales").insert(batch);
    if (error) {
      failures.push({ batchStart: i, batchEnd: i + batch.length - 1, ids: batch.map((r) => r.id), message: error.message });
    } else {
      inserted += batch.length;
    }
  }

  console.log(`\n=== Incremental import summary ===`);
  console.log(`New rows added: ${inserted}`);
  if (failures.length > 0) {
    console.log("Failed batches:");
    for (const f of failures) {
      console.log(`  - rows ${f.batchStart}-${f.batchEnd}: ${f.message}`);
      console.log(`    ids: ${f.ids.join(", ")}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Incremental import failed:", err);
  process.exit(1);
});
