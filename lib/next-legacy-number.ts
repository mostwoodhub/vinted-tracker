import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseShoeId } from "@/lib/item-sale-match";

const LOOKBACK = 10;

// Looks at the last LOOKBACK items that got an old/legacy number typed in at
// intake, and — if most of them share the same letter prefix (e.g. "O") —
// suggests the next number in that sequence. Ordered by internal_number
// (always present, auto-incrementing) rather than created_at, which this
// table may or may not have.
export async function suggestNextLegacyNumber(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("items")
    .select("legacy_number")
    .not("legacy_number", "is", null)
    .order("internal_number", { ascending: false })
    .limit(LOOKBACK);

  const rows = (data ?? [])
    .map((r) => r.legacy_number)
    .filter((v): v is string => Boolean(v));

  if (rows.length < LOOKBACK) return null;

  const parsed = rows
    .map((r) => parseShoeId(r))
    .filter((p): p is NonNullable<typeof p> => p !== null);
  if (parsed.length === 0) return null;

  const counts = new Map<string, number>();
  for (const p of parsed) counts.set(p.prefix, (counts.get(p.prefix) ?? 0) + 1);
  const [majorityPrefix, majorityCount] = [...counts.entries()].sort(
    (a, b) => b[1] - a[1]
  )[0];

  // Too mixed to guess confidently.
  if (majorityCount < Math.ceil(parsed.length / 2)) return null;

  const maxNumber = Math.max(
    ...parsed
      .filter((p) => p.prefix === majorityPrefix)
      .map((p) => p.internalNumber)
  );

  return `${majorityPrefix}${maxNumber + 1}`;
}
