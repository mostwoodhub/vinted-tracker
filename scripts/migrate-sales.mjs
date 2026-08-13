// One-off migration: copy `sales`, `accounts`, `expenses` from the old
// Supabase project into the current project's `sales`,
// `sales_accounts_archive`, `expenses` tables.
//
// Usage: node scripts/migrate-sales.mjs [tables...]
//   tables: any of "sales", "accounts", "expenses" (default: all three)
// Requires in .env.local: OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_KEY,
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Inserts use upsert(onConflict: "id", ignoreDuplicates: true) so the
// script is safe to re-run — already-migrated rows are skipped, not
// duplicated or errored on.

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

async function fetchAll(client, table, orderColumn) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from(table)
      .select("*")
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

function transformAccount(row) {
  return {
    id: row.id,
    name: row.name,
    sort_order: row.sort_order,
  };
}

function transformExpense(row) {
  return {
    id: row.id,
    expense_date: row.date,
    category: row.category,
    description: row.description,
    amount: row.amount,
    batch_name: row.batch_name,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
  };
}

function transformProfile(row) {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    role: row.role,
  };
}

const TABLES = {
  sales: {
    oldTable: "sales",
    newTable: "sales",
    orderColumn: "id",
    transform: transformSale,
  },
  accounts: {
    oldTable: "accounts",
    newTable: "sales_accounts_archive",
    orderColumn: "sort_order",
    transform: transformAccount,
  },
  profiles: {
    oldTable: "profiles",
    newTable: "sales_profiles_archive",
    orderColumn: "id",
    transform: transformProfile,
  },
  expenses: {
    oldTable: "expenses",
    newTable: "expenses",
    orderColumn: "id",
    transform: transformExpense,
  },
};

async function upsertBatches(client, table, rows, batchSize) {
  let upserted = 0;
  const failures = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await client
      .from(table)
      .upsert(batch, { onConflict: "id", ignoreDuplicates: true });
    if (error) {
      failures.push({
        batchStart: i,
        batchEnd: i + batch.length - 1,
        ids: batch.map((r) => r.id),
        message: error.message,
      });
    } else {
      upserted += batch.length;
    }
  }
  return { upserted, failures };
}

async function migrateTable(key) {
  const { oldTable, newTable, orderColumn, transform } = TABLES[key];
  console.log(`\nFetching ${oldTable} from old project...`);
  const oldRows = await fetchAll(oldClient, oldTable, orderColumn);
  console.log(`  fetched ${oldRows.length} rows`);

  const rows = oldRows.map(transform);
  console.log(`Upserting ${rows.length} rows into ${newTable} (batches of ${INSERT_BATCH_SIZE})...`);
  const result = await upsertBatches(newClient, newTable, rows, INSERT_BATCH_SIZE);

  return { key, newTable, total: rows.length, ...result };
}

async function main() {
  const requested = process.argv.slice(2);
  const keys = requested.length > 0 ? requested : Object.keys(TABLES);

  for (const key of keys) {
    if (!TABLES[key]) {
      console.error(`Unknown table "${key}". Valid: ${Object.keys(TABLES).join(", ")}`);
      process.exit(1);
    }
  }

  const results = [];
  for (const key of keys) {
    results.push(await migrateTable(key));
  }

  console.log("\n=== Migration summary ===");
  let allOk = true;
  for (const r of results) {
    const skipped = r.total - r.upserted;
    console.log(`${r.newTable}: ${r.upserted}/${r.total} upserted (existing rows skipped as duplicates), ${skipped} not newly inserted`);
    if (r.failures.length > 0) {
      allOk = false;
      console.log("  Failed batches:");
      for (const f of r.failures) {
        console.log(`  - rows ${f.batchStart}-${f.batchEnd}: ${f.message}`);
        console.log(`    ids: ${f.ids.join(", ")}`);
      }
    }
  }

  console.log(`\n${allOk ? "SUCCESS" : "COMPLETED WITH ERRORS"}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
