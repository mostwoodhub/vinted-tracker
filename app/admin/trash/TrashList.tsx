"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { formatItemNumber } from "@/lib/item-number";
import { restoreItem } from "./actions";
import { cardClass, mutedTextClass } from "@/lib/ui-classes";

export type TrashItem = {
  id: string;
  internal_number: number;
  brand: string | null;
  model: string | null;
  size: string | null;
  price: number | null;
  deleted_at: string;
  batches: { label: string | null } | null;
};

function RestoreButton({ itemId, label }: { itemId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Przywrócić towar ${label} do magazynu?`)) return;
    startTransition(async () => {
      try {
        await restoreItem(itemId);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Nie udało się przywrócić towaru");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-success-bg)] px-4 py-2 text-sm font-medium text-[var(--color-success)] transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Przywracanie…" : "♻️ Przywróć"}
    </button>
  );
}

export function TrashList({ items }: { items: TrashItem[] }) {
  if (items.length === 0) {
    return (
      <div className={`${cardClass} text-center text-sm ${mutedTextClass}`}>
        Kosz jest pusty.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--gap-default)]">
      {items.map((item) => {
        const label = formatItemNumber(item.batches?.label, item.internal_number);
        return (
          <div
            key={item.id}
            className="flex items-center justify-between gap-[var(--space-md)] rounded-[var(--radius-md)] bg-[var(--color-surface)] p-[var(--card-padding)]"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="font-bold text-[var(--color-text)]">
                {label} · {item.brand ?? "—"} {item.model ?? ""}
              </p>
              <p className={`truncate text-sm ${mutedTextClass}`}>
                Rozmiar {item.size ?? "—"}
                {item.price != null ? ` · ${item.price} zł` : ""} · usunięto{" "}
                {new Date(item.deleted_at).toLocaleString("pl-PL")}
              </p>
            </div>
            <RestoreButton itemId={item.id} label={label} />
          </div>
        );
      })}
    </div>
  );
}
