import { formatItemNumber } from "@/lib/item-number";
import { ListingsEditor, type ListingsItem, type PhotoSetOption } from "./ListingsEditor";
import { cardClass, mutedTextClass } from "@/lib/ui-classes";

type Item = ListingsItem & {
  internal_number: number;
  legacy_number: string | null;
  brand: string | null;
  model: string | null;
  size: string | null;
  batches: { label: string | null } | null;
};

export function DraftItemCard({
  item,
  accountNames,
  photoSets,
}: {
  item: Item;
  accountNames: string[];
  photoSets: PhotoSetOption[];
}) {
  return (
    <div className={`flex flex-col gap-4 ${cardClass}`}>
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Towar {formatItemNumber(item.batches?.label, item.internal_number, item.legacy_number)}
        </h2>
        <p className={`text-sm ${mutedTextClass}`}>
          {[item.brand, item.model, item.size].filter(Boolean).join(" · ") ||
            "—"}
        </p>
      </div>

      <ListingsEditor item={item} accountNames={accountNames} photoSets={photoSets} />
    </div>
  );
}
