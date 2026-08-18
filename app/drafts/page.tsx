import { supabaseAdmin } from "@/lib/supabase-admin";
import { DraftItemCard } from "./DraftItemCard";
import { mapListingsForEditor, type RawListingWithPublications } from "@/lib/listing-publications";
import { headingClass, mutedTextClass, pageWrapClass } from "@/lib/ui-classes";

type ItemWithListings = {
  id: string;
  internal_number: number;
  legacy_number: string | null;
  brand: string | null;
  model: string | null;
  size: string | null;
  price: number | null;
  batches: { label: string | null } | null;
  marketplace_listings: RawListingWithPublications[];
};

export default async function DraftsPage() {
  const { data: items } = await supabaseAdmin
    .from("items")
    .select(
      "id, internal_number, legacy_number, brand, model, size, price, batches(label), marketplace_listings(id, platform, title, description, status, listing_publications(id, account_name, photo_set_id, removed_at))"
    )
    .eq("status", "ai_card_ready")
    .is("deleted_at", null)
    .order("internal_number", { ascending: false });

  const rows = (items ?? []) as unknown as ItemWithListings[];
  const itemIds = rows.map((r) => r.id);

  const { data: accountRows } = await supabaseAdmin
    .from("sales_accounts_archive")
    .select("name")
    .order("sort_order", { ascending: true });
  const accountNames = (accountRows ?? []).map((a) => a.name).filter(Boolean) as string[];

  const photoSetsByItem = new Map<string, { id: string; label: string | null }[]>();
  if (itemIds.length > 0) {
    const { data: photoSetsRaw } = await supabaseAdmin
      .from("item_photo_sets")
      .select("id, item_id, label, sort_order")
      .in("item_id", itemIds)
      .order("sort_order", { ascending: true });

    for (const set of photoSetsRaw ?? []) {
      const list = photoSetsByItem.get(set.item_id) ?? [];
      list.push({ id: set.id, label: set.label });
      photoSetsByItem.set(set.item_id, list);
    }
  }

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-[var(--space-xl)] px-6 py-12">
        <h1 className={headingClass}>Szkice ogłoszeń AI</h1>

        {rows.length === 0 && (
          <p className={`text-sm ${mutedTextClass}`}>
            Brak towarów ze statusem &bdquo;Karta AI&rdquo;.
          </p>
        )}

        <div className="flex flex-col gap-[var(--space-lg)]">
          {rows.map((item) => (
            <DraftItemCard
              key={item.id}
              item={{ ...item, marketplace_listings: mapListingsForEditor(item.marketplace_listings) }}
              accountNames={accountNames}
              photoSets={photoSetsByItem.get(item.id) ?? []}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
