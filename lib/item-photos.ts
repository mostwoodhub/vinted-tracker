import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

// .in("item_id", ids) puts every id straight into the request URL — past
// ~200 items that blows the 16KB header limit and the query fails outright
// (HeadersOverflowError), not just slowly. Chunking keeps each request's
// URL short regardless of how large the warehouse grows.
const ID_CHUNK_SIZE = 150;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Cheap existence check — no signing calls at all, just which items have at
// least one photo row. Used to decide whether a list row should render a
// lazy-loading thumbnail slot or the plain "no photo" placeholder, without
// paying for a signed URL (thumbnail or full-res) up front for every item
// on the page — see loadItemPhotoUrls, called only for the ids actually
// visible on screen.
export async function loadPhotoAvailability(ids: string[]): Promise<Set<string>> {
  const available = new Set<string>();
  if (ids.length === 0) return available;

  const chunkResults = await Promise.all(
    chunk(ids, ID_CHUNK_SIZE).map((idChunk) =>
      supabaseAdmin.from("item_photos").select("item_id").in("item_id", idChunk)
    )
  );
  for (const { data } of chunkResults) {
    for (const row of data ?? []) {
      available.add(row.item_id);
    }
  }
  return available;
}

// List thumbnail (small, transformed) + full-resolution zoom URL for each
// item's photo — working/intake photo always wins over a final publication
// photo, so the list doesn't silently swap thumbnails mid-workflow.
export async function loadItemPhotoUrls(
  ids: string[]
): Promise<{ photoUrlByItem: Map<string, string>; thumbUrlByItem: Map<string, string> }> {
  const photoUrlByItem = new Map<string, string>();
  const thumbUrlByItem = new Map<string, string>();
  if (ids.length === 0) return { photoUrlByItem, thumbUrlByItem };

  // Each item's photos are entirely within one chunk (chunking splits by
  // id, not by time), so per-chunk ordering still preserves "earliest
  // upload wins" below even though chunks aren't merged in global order.
  const chunkResults = await Promise.all(
    chunk(ids, ID_CHUNK_SIZE).map((idChunk) =>
      supabaseAdmin
        .from("item_photos")
        .select("item_id, storage_path, is_working_photo")
        .in("item_id", idChunk)
        .order("uploaded_at", { ascending: true })
    )
  );
  const photos = chunkResults.flatMap((r) => r.data ?? []);

  const finalByItem = new Map<string, string>();
  const workingByItem = new Map<string, string>();

  for (const photo of photos) {
    if (photo.is_working_photo) {
      if (!workingByItem.has(photo.item_id)) {
        workingByItem.set(photo.item_id, photo.storage_path);
      }
    } else if (!finalByItem.has(photo.item_id)) {
      finalByItem.set(photo.item_id, photo.storage_path);
    }
  }

  const pathByItem = new Map<string, string>();
  for (const id of ids) {
    // Working/intake photo always wins for the list thumbnail — it's the
    // consistent reference shot taken at intake, so the list shouldn't
    // silently swap it for a final publication photo mid-workflow.
    const path = workingByItem.get(id) ?? finalByItem.get(id);
    if (path) pathByItem.set(id, path);
  }

  const paths = Array.from(pathByItem.values());
  if (paths.length === 0) return { photoUrlByItem, thumbUrlByItem };

  // Full-resolution signed URLs, batched in one call — cheap, and only ever
  // downloaded if someone actually clicks a thumbnail to zoom.
  const { data: signed } = await supabaseAdmin.storage.from("item-photos").createSignedUrls(paths, 60 * 60);

  const signedUrlByPath = new Map<string, string>();
  for (const entry of signed ?? []) {
    if (entry.signedUrl) {
      signedUrlByPath.set(entry.path ?? "", entry.signedUrl);
    }
  }

  // Small transformed copies for the list thumbnails — working photos are
  // raw phone-camera files (often several MB each) and the batch sign call
  // above has no way to request a resize, so every row was downloading its
  // full original just to show a 64px square. Supabase's signed-URL image
  // transform needs one call per path (no batch variant), but that's still
  // just URL generation, not image processing, so a few hundred in
  // parallel resolve in ~2-3s.
  const thumbResults = await Promise.all(
    paths.map((path) =>
      supabaseAdmin.storage
        .from("item-photos")
        .createSignedUrl(path, 60 * 60, { transform: { width: 128, height: 128, resize: "cover" } })
        .then((res) => [path, res.data?.signedUrl ?? null] as const)
    )
  );
  const thumbUrlByPath = new Map(thumbResults.filter(([, url]) => url != null));

  for (const [itemId, path] of pathByItem) {
    const url = signedUrlByPath.get(path);
    if (url) photoUrlByItem.set(itemId, url);
    const thumbUrl = thumbUrlByPath.get(path);
    if (thumbUrl) thumbUrlByItem.set(itemId, thumbUrl);
  }
  return { photoUrlByItem, thumbUrlByItem };
}
