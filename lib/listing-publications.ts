import type { Listing } from "@/app/drafts/ListingsEditor";

// Raw shape as returned by a Supabase nested select on
// marketplace_listings(..., listing_publications(...)) — snake_case columns.
export type RawListingWithPublications = {
  id: string;
  platform: string;
  title: string | null;
  description: string | null;
  status: string | null;
  listing_publications: {
    id: string;
    account_name: string;
    photo_set_id: string | null;
    removed_at: string | null;
  }[];
};

// The ListingsEditor (shared between /drafts and /items/[id]) expects
// camelCase fields and only wants publications that haven't been removed —
// removed ones stay in the DB as history but shouldn't clutter the UI.
export function mapListingsForEditor(raw: RawListingWithPublications[] | null | undefined): Listing[] {
  return (raw ?? []).map((listing) => ({
    id: listing.id,
    platform: listing.platform,
    title: listing.title,
    description: listing.description,
    status: listing.status,
    publications: (listing.listing_publications ?? [])
      .filter((p) => !p.removed_at)
      .map((p) => ({ id: p.id, accountName: p.account_name, photoSetId: p.photo_set_id })),
  }));
}
