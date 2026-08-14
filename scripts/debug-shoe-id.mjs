// Quick diagnostic for one shoe number: shows exactly what
// markItemSoldByShoeId (lib/item-sale-link.ts) would see — the parsed
// prefix/internal_number, every item with that internal_number and which
// batch each belongs to, and every sale referencing this shoe id.
//
// Run: node scripts/debug-shoe-id.mjs ZA16678

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

const shoeId = process.argv[2];
if (!shoeId) {
  console.error("Usage: node scripts/debug-shoe-id.mjs <shoeId>  (e.g. ZA16678)");
  process.exit(1);
}

const env = loadEnvLocal();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const match = shoeId.trim().match(/^([A-Za-z]*)(\d+)$/);
  if (!match) {
    console.log(`"${shoeId}" nie pasuje do wzorca [litery][cyfry] — nic nie da sie dopasowac.`);
    return;
  }
  const [, prefix, numberStr] = match;
  const internalNumber = Number(numberStr);
  console.log(`Rozbito "${shoeId}" na: prefiks="${prefix}", internal_number=${internalNumber}\n`);

  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("id, internal_number, status, batch_id, batches(label, batch_number)")
    .eq("internal_number", internalNumber);
  if (itemsError) {
    console.error("Blad zapytania o items:", itemsError.message);
  } else if (!items || items.length === 0) {
    console.log(`Zaden towar w tabeli "items" nie ma internal_number = ${internalNumber}.`);
    console.log(
      "To znaczy, ze ten numer nie odpowiada zadnemu realnemu towarowi — sprawdz prawdziwy numer na stronie partii (/batches/<id>) albo w Magazynie."
    );
  } else {
    console.log(`Znaleziono ${items.length} towar(ow) z internal_number = ${internalNumber}:`);
    for (const item of items) {
      const b = Array.isArray(item.batches) ? item.batches[0] : item.batches;
      console.log(
        `  - id=${item.id} status=${item.status} batch_label=${b?.label ?? "(brak partii)"} batch_number=${b?.batch_number ?? "-"}`
      );
    }
    const labelMatch = items.find((it) => {
      const b = Array.isArray(it.batches) ? it.batches[0] : it.batches;
      return (b?.label ?? null) === (prefix || null);
    });
    console.log(
      labelMatch
        ? `\n=> Dopasowanie po prefiksie "${prefix}": towar ${labelMatch.id} (status: ${labelMatch.status})`
        : items.length === 1
          ? `\n=> Tylko jeden kandydat, wiec zostalby uzyty mimo ze prefiks "${prefix}" nie pasuje do jego partii.`
          : `\n=> Kilka towarow, zaden nie pasuje do prefiksu "${prefix}" — markItemSoldByShoeId pominalby to jako niejednoznaczne.`
    );
  }

  console.log();
  const { data: sales, error: salesError } = await supabase
    .from("sales")
    .select("id, legacy_shoe_id, items, sale_date, buyer_name")
    .or(`legacy_shoe_id.eq.${shoeId},legacy_shoe_id.ilike.%${shoeId}%`);
  if (salesError) {
    console.error("Blad zapytania o sales:", salesError.message);
  } else {
    console.log(`Sprzedaze z legacy_shoe_id pasujacym do "${shoeId}": ${sales?.length ?? 0}`);
    for (const sale of sales ?? []) {
      console.log(`  - ${sale.id} | ${sale.sale_date} | ${sale.buyer_name} | "${sale.legacy_shoe_id}"`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
