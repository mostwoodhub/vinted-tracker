// One-off backfill: walks every row in `sales` and, for each shoe number it
// references, applies the same matching markItemSoldByShoeId (see
// lib/item-sale-link.ts) uses going forward — parse the batch-letter prefix
// + internal_number out of the shoe id, find that item, mark it sold if it
// isn't already, and log the transition.
//
// Needed because that linkage never existed before: every sale recorded up
// to now left items.status untouched, so batch "sold X of N" counts were
// wrong for anything with a real `items` row. This is a no-op for shoe
// numbers with no matching item (legacy/bulk-imported sales, typos) — it
// only ever updates items that unambiguously match.
//
// Run: node scripts/backfill-sold-status.mjs
// Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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
for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!env[key]) {
    console.error(`Missing ${key} in .env.local`);
    process.exit(1);
  }
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function fetchAllSales() {
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("sales")
      .select("id, legacy_shoe_id, items")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function fetchAllItems() {
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("items")
      .select("id, internal_number, status, batches(label)")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function batchLabelOf(item) {
  const b = item.batches;
  if (!b) return null;
  return Array.isArray(b) ? (b[0]?.label ?? null) : b.label;
}

function parseShoeId(shoeId) {
  if (!shoeId) return null;
  const match = String(shoeId).trim().match(/^([A-Za-z]*)(\d+)$/);
  if (!match) return null;
  const [, prefix, numberStr] = match;
  const internalNumber = Number(numberStr);
  if (!Number.isInteger(internalNumber)) return null;
  return { prefix, internalNumber };
}

async function main() {
  console.log("Pobieranie sprzedazy i towarow...");
  const [sales, items] = await Promise.all([fetchAllSales(), fetchAllItems()]);
  console.log(`${sales.length} sprzedazy, ${items.length} towarow.\n`);

  const itemsByNumber = new Map();
  for (const item of items) {
    if (!itemsByNumber.has(item.internal_number)) itemsByNumber.set(item.internal_number, []);
    itemsByNumber.get(item.internal_number).push(item);
  }

  // Collect every shoeId referenced by any sale, deduped, so each item is
  // touched at most once even if referenced by multiple sale rows.
  const shoeIds = new Set();
  for (const sale of sales) {
    if (Array.isArray(sale.items) && sale.items.length > 0) {
      for (const entry of sale.items) {
        if (entry?.shoeId) shoeIds.add(entry.shoeId);
      }
    } else if (sale.legacy_shoe_id) {
      shoeIds.add(sale.legacy_shoe_id);
    }
  }

  console.log(`${shoeIds.size} unikalnych numerow butow w historii sprzedazy.\n`);

  let updated = 0;
  let alreadySold = 0;
  let ambiguous = 0;
  let unmatched = 0;

  for (const shoeId of shoeIds) {
    const parsed = parseShoeId(shoeId);
    if (!parsed) {
      unmatched++;
      continue;
    }
    const candidates = itemsByNumber.get(parsed.internalNumber) ?? [];
    if (candidates.length === 0) {
      unmatched++;
      continue;
    }
    const item =
      candidates.length === 1
        ? candidates[0]
        : candidates.find((c) => batchLabelOf(c) === (parsed.prefix || null));

    if (!item) {
      ambiguous++;
      console.log(
        `  ? ${shoeId}: kilka towarow z numerem ${parsed.internalNumber}, zaden nie pasuje do prefiksu "${parsed.prefix}"`
      );
      continue;
    }
    if (item.status === "sold") {
      alreadySold++;
      continue;
    }

    const { error: updateError } = await supabase
      .from("items")
      .update({ status: "sold" })
      .eq("id", item.id);
    if (updateError) {
      console.log(`  ! ${shoeId}: blad aktualizacji — ${updateError.message}`);
      continue;
    }
    await supabase.from("item_status_log").insert({
      item_id: item.id,
      from_status: item.status,
      to_status: "sold",
    });
    updated++;
    console.log(`  + ${shoeId}: ${item.status} -> sold`);
  }

  console.log(`\nGotowe.`);
  console.log(`  Oznaczono jako sprzedane: ${updated}`);
  console.log(`  Juz byly sprzedane: ${alreadySold}`);
  console.log(`  Bez pasujacego towaru (prawdopodobnie brak w items — OK): ${unmatched}`);
  console.log(`  Niejednoznaczne (kilka towarow, zaden nie pasuje): ${ambiguous}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
