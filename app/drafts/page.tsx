import { supabaseAdmin } from "@/lib/supabase-admin";
import { DraftItemCard } from "./DraftItemCard";
import { headingClass, mutedTextClass, pageWrapClass } from "@/lib/ui-classes";

type Listing = {
  id: string;
  platform: string;
  title: string | null;
  description: string | null;
};

type ItemWithListings = {
  id: string;
  internal_number: number;
  brand: string | null;
  model: string | null;
  size: string | null;
  price: number | null;
  batches: { label: string | null } | null;
  marketplace_listings: Listing[];
};

export default async function DraftsPage() {
  const { data: items } = await supabaseAdmin
    .from("items")
    .select(
      "id, internal_number, brand, model, size, price, batches(label), marketplace_listings(id, platform, title, description)"
    )
    .eq("status", "ai_card_ready")
    .order("internal_number", { ascending: false });

  const rows = (items ?? []) as unknown as ItemWithListings[];

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
            <DraftItemCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}
