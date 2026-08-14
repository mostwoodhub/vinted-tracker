// Checks whether the old app's one-time "Zaimportuj raport 2025" action
// (12 monthly aggregate sales entries on an "Archiwum 2025" account) made it
// through the migration into the new database. Just a lookup — makes no
// changes.
//
// Run: node scripts/check-archiwum-2025.mjs

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
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const { data: accounts, error: accountsError } = await supabase
    .from("sales_accounts_archive")
    .select("id, name, sort_order")
    .or("name.ilike.%archiwum%,name.ilike.%2025%");

  if (accountsError) {
    console.error("Blad zapytania o konta:", accountsError.message);
    return;
  }

  if (!accounts || accounts.length === 0) {
    console.log(
      'Nie znaleziono zadnego konta z "archiwum" ani "2025" w nazwie w sales_accounts_archive.'
    );
    console.log("Sprawdzam bezposrednio w sales, na wypadek gdyby konto nie zostalo zaimportowane do listy kont...\n");
  } else {
    console.log(`Znaleziono ${accounts.length} pasujace konto(a):`);
    for (const a of accounts) console.log(`  - "${a.name}" (id=${a.id}, sort_order=${a.sort_order})`);
    console.log();
  }

  const { data: sales, error: salesError } = await supabase
    .from("sales")
    .select("id, sale_date, account_name, sale_price, buyer_name, legacy_shoe_id")
    .or("account_name.ilike.%archiwum%,account_name.ilike.%2025%")
    .order("sale_date", { ascending: true });

  if (salesError) {
    console.error("Blad zapytania o sprzedaze:", salesError.message);
    return;
  }

  console.log(`Sprzedaze z kontem pasujacym do "archiwum"/"2025": ${sales?.length ?? 0}`);
  for (const s of sales ?? []) {
    console.log(
      `  - ${s.sale_date} | konto: "${s.account_name}" | ${s.sale_price} zl | ${s.buyer_name ?? s.legacy_shoe_id ?? ""}`
    );
  }

  if (!sales || sales.length === 0) {
    console.log(
      "\n=> Nic nie znaleziono. Albo import w starej aplikacji zapisywal dane pod inna nazwa konta, albo te dane nie zostaly przeniesione."
    );
  } else if (sales.length === 12) {
    console.log("\n=> Dokladnie 12 wpisow — wyglada na to, ze import z 2025 przeszedl poprawnie.");
  } else {
    console.log(
      `\n=> Znaleziono ${sales.length} wpisow (oczekiwano 12) — warto sprawdzic recznie, czy to na pewno te dane.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
