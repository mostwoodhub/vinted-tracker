import "server-only";

const PAGE_SIZE = 1000;
// How many pages to fetch in parallel once we know there's more than one —
// for the ~10k-row sales table (~10 pages) this cuts a full fetch from
// ~11 sequential round trips down to ~3 waves, roughly 3x faster in
// practice. Kept modest so a single fetchAllRows call can't flood the
// Supabase connection pool.
const CONCURRENCY = 5;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

// supabase-js/PostgREST caps unpaginated queries at 1000 rows by default.
// Pass a function that applies .range(from, to) to your built query, e.g.:
//   fetchAllRows((from, to) =>
//     supabaseAdmin.from("sales").select("*").is("deleted_at", null).range(from, to)
//   )
//
// The first page is always fetched alone — most callers' tables fit in one
// page, and this keeps that common case at exactly one round trip, same as
// before. Only once a full first page proves there's more to fetch do
// subsequent pages go out in parallel waves instead of one at a time.
export async function fetchAllRows<T>(
  queryPage: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const first = await queryPage(0, PAGE_SIZE - 1);
  if (first.error) throw new Error(first.error.message);
  const firstBatch = first.data ?? [];
  if (firstBatch.length < PAGE_SIZE) return firstBatch;

  const rows: T[] = [...firstBatch];
  let from = PAGE_SIZE;
  let done = false;

  while (!done) {
    const starts = Array.from({ length: CONCURRENCY }, (_, i) => from + i * PAGE_SIZE);
    const results = await Promise.all(
      starts.map((start) => queryPage(start, start + PAGE_SIZE - 1))
    );

    for (const { data, error } of results) {
      if (error) throw new Error(error.message);
      const batch = data ?? [];
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) {
        done = true;
        break;
      }
    }

    from += CONCURRENCY * PAGE_SIZE;
  }

  return rows;
}
