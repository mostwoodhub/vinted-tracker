import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function getDistinctValues(
  table: "items" | "batches",
  column: string
): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from(table)
    .select(column)
    .not(column, "is", null);

  const values = new Set<string>();
  for (const row of (data ?? []) as unknown as Record<string, string | null>[]) {
    const value = row[column];
    if (value) values.add(value);
  }

  return Array.from(values).sort();
}
