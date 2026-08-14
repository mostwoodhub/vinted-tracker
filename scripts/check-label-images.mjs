// Diagnostic: scans every `sales` row and checks that label_url, label_url2,
// photo_url and photo_urls actually point at valid, decodable image files.
//
// Checks two things per URL:
//   1. Is it reachable at all (HTTP status)?
//   2. Do the first bytes match a known image format (PNG/JPEG/GIF/WEBP)?
//      This catches the case a plain HTTP check misses: a 200 response whose
//      body isn't actually an image (e.g. an HTML error page saved with an
//      image content-type, an empty/truncated upload, or a carrier PDF that
//      got stored under label_url instead of being converted to an image —
//      the browser's Image() element silently fails to decode all of these,
//      which is what shows up as "Uszkodzony plik obrazu" in the PDF export).
//
// Run: node scripts/check-label-images.mjs
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
      .select("id, buyer_name, sale_date, legacy_shoe_id, label_url, label_url2, photo_url, photo_urls")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

const SIGNATURES = [
  { name: "PNG", check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { name: "JPEG", check: (b) => b[0] === 0xff && b[1] === 0xd8 },
  { name: "GIF", check: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  {
    name: "WEBP",
    check: (b) => b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP",
  },
];
function isPdf(b) {
  return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
}

async function checkUrl(url) {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-15" } });
    if (!(res.status === 200 || res.status === 206)) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return { ok: false, reason: "plik ma 0 bajtow (pusty upload)" };
    const match = SIGNATURES.find((sig) => sig.check(buf));
    if (match) return { ok: true, format: match.name };
    if (isPdf(buf)) return { ok: false, reason: "to jest PDF, nie obraz — przegladarka tego nie wyswietli jako <img>" };
    return { ok: false, reason: `nierozpoznany format (pierwsze bajty: ${buf.toString("hex", 0, 4)})` };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

function context(sale) {
  return sale.legacy_shoe_id || sale.buyer_name || sale.id;
}

async function main() {
  console.log("Pobieranie sprzedazy...");
  const sales = await fetchAllSales();
  console.log(`Znaleziono ${sales.length} sprzedazy. Sprawdzanie plikow...\n`);

  // Map url -> list of {sale, field} referencing it, so we only fetch each
  // distinct URL once even if reused across rows.
  const refs = new Map();
  function addRef(url, sale, field) {
    if (!url) return;
    if (!refs.has(url)) refs.set(url, []);
    refs.get(url).push({ sale, field });
  }
  for (const sale of sales) {
    addRef(sale.label_url, sale, "label_url");
    addRef(sale.label_url2, sale, "label_url2");
    addRef(sale.photo_url, sale, "photo_url");
    for (const u of sale.photo_urls || []) addRef(u, sale, "photo_urls[]");
  }

  const urls = [...refs.keys()];
  console.log(`${urls.length} unikalnych URL-i do sprawdzenia.\n`);

  const broken = [];
  let checked = 0;
  const CONCURRENCY = 8;
  let idx = 0;
  async function worker() {
    while (idx < urls.length) {
      const url = urls[idx++];
      const result = await checkUrl(url);
      checked++;
      if (checked % 200 === 0) console.log(`  ...${checked}/${urls.length}`);
      if (!result.ok) {
        for (const { sale, field } of refs.get(url)) {
          broken.push({ context: context(sale), saleId: sale.id, field, url, reason: result.reason });
        }
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\nGotowe. Sprawdzono ${urls.length} plikow, uszkodzonych/niedostepnych: ${broken.length}.\n`);
  if (broken.length > 0) {
    console.log("=== Uszkodzone pliki ===");
    for (const b of broken) {
      console.log(`- [${b.context}] ${b.field}: ${b.reason}`);
      console.log(`    sale id: ${b.saleId}`);
      console.log(`    url: ${b.url}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
