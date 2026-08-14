import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatItemNumber } from "@/lib/item-number";
import { cardClass, headingClass, mutedTextClass, pageWrapClass } from "@/lib/ui-classes";

export default async function PhotoQueuePage() {
  const { data: items } = await supabaseAdmin
    .from("items")
    .select("id, internal_number, brand, size, batches(label)")
    .eq("status", "received")
    .is("deleted_at", null)
    .order("internal_number", { ascending: true });

  const rows = (items ?? []) as unknown as {
    id: string;
    internal_number: number;
    brand: string | null;
    size: string | null;
    batches: { label: string | null } | null;
  }[];

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-[var(--space-lg)] px-6 py-12">
        <h1 className={headingClass}>Towary do zdjęć</h1>

        {rows.length === 0 && (
          <p className={`text-sm ${mutedTextClass}`}>
            Brak towarów oczekujących na zdjęcia.
          </p>
        )}

        <ul className="flex flex-col gap-[var(--gap-default)]">
          {rows.map((item) => (
            <li key={item.id} className={cardClass}>
              <Link
                href={`/items/${item.id}`}
                className="flex items-center justify-between gap-3"
              >
                <span className="font-bold text-[var(--color-text)]">
                  📸{" "}
                  {formatItemNumber(item.batches?.label, item.internal_number)}
                </span>
                <span className={`text-sm ${mutedTextClass}`}>
                  {[item.brand, item.size].filter(Boolean).join(" · ") || "—"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
