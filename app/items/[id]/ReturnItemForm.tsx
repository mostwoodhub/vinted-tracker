"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { markAsReturned, type ReturnItemState } from "./actions";
import {
  buttonDangerClass,
  buttonDangerOutlineClass,
  buttonSecondaryClass,
  checkboxClass,
  errorTextClass,
  noticeDangerClass,
  successTextClass,
} from "@/lib/ui-classes";

const initialState: ReturnItemState = { status: "idle" };

const NEXT_STATUS_OPTIONS = [
  { value: "ready_to_publish", label: "Do ponownej sprzedaży" },
  { value: "photos_uploaded", label: "Wymaga sprawdzenia" },
];

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonDangerClass}>
      {pending ? "Zapisywanie…" : "Potwierdź zwrot"}
    </button>
  );
}

export function ReturnItemForm({ itemId }: { itemId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(markAsReturned, initialState);

  if (state.status === "success") {
    return <p className={successTextClass}>Zwrot zarejestrowany.</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonDangerOutlineClass}
      >
        Oznacz jako zwrot
      </button>
    );
  }

  return (
    <form action={formAction} className={noticeDangerClass}>
      <input type="hidden" name="itemId" value={itemId} />

      <p className="text-sm font-medium text-[var(--color-danger)]">
        Zwrot towaru
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-[var(--color-text)]">
          Stan towaru po zwrocie
        </legend>
        {NEXT_STATUS_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-2 text-sm text-[var(--color-text)]"
          >
            <input
              type="radio"
              name="nextStatus"
              value={option.value}
              required
              className={checkboxClass}
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
        <input
          type="checkbox"
          name="refunded"
          value="true"
          className={checkboxClass}
        />
        Zwrot środków klientowi
      </label>

      {state.status === "error" && (
        <p className={errorTextClass} role="alert">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <SubmitButton />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={buttonSecondaryClass}
        >
          Anuluj
        </button>
      </div>
    </form>
  );
}
