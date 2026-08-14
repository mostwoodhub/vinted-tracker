"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteItem } from "./actions";

export function DeleteItemButton({
  itemId,
  label,
}: {
  itemId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Na pewno usunąć towar ${label} z magazynu?`)) return;
    startTransition(async () => {
      try {
        await deleteItem(itemId);
        router.push("/warehouse");
      } catch (err) {
        alert(err instanceof Error ? err.message : "Nie udało się usunąć towaru");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="w-fit rounded-[var(--radius-sm)] bg-[var(--color-danger-bg)] px-4 py-2 text-sm font-medium text-[var(--color-danger)] transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Usuwanie…" : "🗑️ Usuń towar z magazynu"}
    </button>
  );
}
