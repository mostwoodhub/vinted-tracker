import "server-only";

const PAGE_SIZE = 1000;

// supabase-js/PostgREST caps unpaginated queries at 1000 rows by default.
// Pass a function that applies .range(from, to) to your built query, e.g.:
//   fetchAllRows((from, to) =>
//     supabaseAdmin.from("sales").select("*").is("deleted_at", null).range(from, to)
//   )
export async function fetchAllRows<T>(
  queryPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await queryPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}
