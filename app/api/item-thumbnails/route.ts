import { NextRequest, NextResponse } from "next/server";
import { getCurrentEmployee } from "@/lib/auth";
import { loadItemPhotoUrls } from "@/lib/item-photos";

// Signs photo URLs (thumbnail + full-res) only for the item ids a client
// actually asks for — called from WarehouseCards as rows scroll into view,
// instead of the page itself eagerly signing every item's photo on every
// load (that's what silently failed/slowed once the warehouse passed a
// few hundred items — see lib/item-photos.ts).
const MAX_IDS_PER_REQUEST = 60;

export async function POST(request: NextRequest) {
  const employee = await getCurrentEmployee();
  if (!employee) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const ids = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const trimmedIds = ids.slice(0, MAX_IDS_PER_REQUEST);
  const { photoUrlByItem, thumbUrlByItem } = await loadItemPhotoUrls(trimmedIds);

  const result: Record<string, { photoUrl: string | null; thumbUrl: string | null }> = {};
  for (const id of trimmedIds) {
    result[id] = {
      photoUrl: photoUrlByItem.get(id) ?? null,
      thumbUrl: thumbUrlByItem.get(id) ?? null,
    };
  }

  return NextResponse.json(result);
}
