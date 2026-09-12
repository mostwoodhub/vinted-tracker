import "server-only";

// NBP (Narodowy Bank Polski) publishes "table A" mid rates only on business
// days — a weekend/holiday sale date has no rate of its own. Standard
// convention: walk backward to the most recent published rate.
const MAX_LOOKBACK_DAYS = 7;

// The official NBP mid rate is a reference point, not what actually lands
// in the account — payment processors/marketplace payouts always convert
// at a worse rate. 3% below NBP mid approximates that real-world spread
// (confirmed with the user rather than guessed).
const PAYOUT_MARGIN = 0.97;

async function fetchNbpMidRate(currencyCode: string, isoDate: string): Promise<number | null> {
  const res = await fetch(
    `https://api.nbp.pl/api/exchangerates/rates/a/${currencyCode.toLowerCase()}/${isoDate}/?format=json`,
    { cache: "no-store" }
  );
  if (!res.ok) return null; // 404 on non-business days — not an error, just try an earlier date
  const data = (await res.json()) as { rates?: { mid?: number }[] };
  return data.rates?.[0]?.mid ?? null;
}

// Returns how many PLN one unit of `currencyCode` is worth, already
// discounted by PAYOUT_MARGIN. PLN itself is always 1 — no network call.
export async function getPayoutRateToPln(currencyCode: string, saleDateIso: string): Promise<number> {
  if (currencyCode === "PLN") return 1;

  const date = new Date(`${saleDateIso}T00:00:00Z`);
  for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
    const iso = date.toISOString().slice(0, 10);
    const mid = await fetchNbpMidRate(currencyCode, iso);
    if (mid != null) return mid * PAYOUT_MARGIN;
    date.setUTCDate(date.getUTCDate() - 1);
  }
  throw new Error(
    `Nie udało się pobrać kursu ${currencyCode} z NBP dla daty ${saleDateIso} (sprawdzono ${MAX_LOOKBACK_DAYS} dni wstecz)`
  );
}
