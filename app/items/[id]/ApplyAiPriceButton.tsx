"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { applyAiSuggestedPrice } from "./actions";

export function ApplyAiPriceButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        await applyAiSuggestedPrice(itemId);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Nie udało się ustawić ceny");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="w-fit text-xs underline text-[var(--color-accent)] hover:opacity-80 disabled:opacity-50"
    >
      {pending ? "Ustawianie…" : "Zastosuj jako cenę"}
    </button>
  );
}
