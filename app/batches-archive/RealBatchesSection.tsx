"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  updateBatchPurchaseCost,
  deleteBatch,
  type BatchActionState,
} from "@/app/batches/[id]/actions";
import { createBatch } from "./actions";
import { formatPln } from "@/lib/format";
import {
  buttonDangerClass,
  buttonPrimaryClass,
  buttonSecondaryClass,
  cardClass,
  errorTextClass,
  inputClass,
  labelClass,
  mutedTextClass,
  noticeDangerClass,
} from "@/lib/ui-classes";

const initialState: BatchActionState = { status: "idle" };

export type RealBatchRow = {
  id: string;
  label: string | null;
  batchNumber: number;
  purchaseCost: number | null;
  purchaseLocation: string | null;
  quantity: number | null;
  itemCount: number;
  soldCount: number;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonPrimaryClass}>
      {pending ? "Zapisywanie…" : "Zapisz"}
    </button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonDangerClass}>
      {pending ? "Usuwanie…" : "Usuń partię"}
    </button>
  );
}

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonPrimaryClass}>
      {pending ? "Tworzenie…" : "Utwórz partię"}
    </button>
  );
}

function CreateBatchForm() {
  const [open, setOpen] = useState(false);
  const [createState, createAction] = useActionState(createBatch, initialState);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonSecondaryClass}>
        + Dodaj partię
      </button>
    );
  }

  return (
    <form action={createAction} className={`flex flex-col gap-3 ${cardClass}`}>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Nazwa partii</span>
        <input name="label" type="text" required className={`${inputClass} max-w-xs`} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Koszt zakupu partii</span>
        <input
          name="purchaseCost"
          type="number"
          step="0.01"
          min="0"
          className={`${inputClass} max-w-xs`}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Gdzie kupiono</span>
        <input
          name="purchaseLocation"
          type="text"
          placeholder="np. sprzedawca, sklep, źródło"
          className={`${inputClass} max-w-xs`}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Ilość (informacyjnie)</span>
        <input
          name="quantity"
          type="number"
          step="1"
          min="0"
          className={`${inputClass} max-w-xs`}
        />
      </label>
      {createState.status === "error" && (
        <p className={errorTextClass} role="alert">
          {createState.error}
        </p>
      )}
      <div className="flex gap-2">
        <CreateButton />
        <button type="button" onClick={() => setOpen(false)} className={buttonSecondaryClass}>
          Anuluj
        </button>
      </div>
    </form>
  );
}

function RealBatchCard({ batch }: { batch: RealBatchRow }) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saveState, saveAction] = useActionState(updateBatchPurchaseCost, initialState);
  const [deleteState, deleteAction] = useActionState(deleteBatch, initialState);

  // Adjust state during render (React-sanctioned pattern) instead of an
  // effect, to close the edit form the moment a save succeeds.
  const [handledSaveState, setHandledSaveState] = useState(saveState);
  if (saveState !== handledSaveState) {
    setHandledSaveState(saveState);
    if (saveState.status === "success" && editing) setEditing(false);
  }

  if (confirmingDelete) {
    return (
      <div className={noticeDangerClass}>
        <p className="text-sm text-[var(--color-danger)]">
          Na pewno usunąć partię {batch.label ?? batch.batchNumber}? Towary (
          {batch.itemCount}) nie zostaną usunięte — zostaną tylko odłączone od
          partii.
        </p>
        {deleteState.status === "error" && (
          <p className={errorTextClass} role="alert">
            {deleteState.error}
          </p>
        )}
        <form action={deleteAction} className="flex gap-2">
          <input type="hidden" name="batchId" value={batch.id} />
          <DeleteButton />
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            className={buttonSecondaryClass}
          >
            Anuluj
          </button>
        </form>
      </div>
    );
  }

  if (editing) {
    return (
      <form action={saveAction} className={`flex flex-col gap-3 ${cardClass}`}>
        <input type="hidden" name="batchId" value={batch.id} />
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Nazwa partii</span>
          <input
            name="label"
            type="text"
            defaultValue={batch.label ?? ""}
            className={`${inputClass} max-w-xs`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Koszt zakupu partii</span>
          <input
            name="purchaseCost"
            type="number"
            step="0.01"
            min="0"
            defaultValue={batch.purchaseCost ?? ""}
            className={`${inputClass} max-w-xs`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Gdzie kupiono</span>
          <input
            name="purchaseLocation"
            type="text"
            defaultValue={batch.purchaseLocation ?? ""}
            placeholder="np. sprzedawca, sklep, źródło"
            className={`${inputClass} max-w-xs`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Ilość (informacyjnie)</span>
          <input
            name="quantity"
            type="number"
            step="1"
            min="0"
            defaultValue={batch.quantity ?? ""}
            className={`${inputClass} max-w-xs`}
          />
        </label>
        {saveState.status === "error" && (
          <p className={errorTextClass} role="alert">
            {saveState.error}
          </p>
        )}
        <div className="flex gap-2">
          <SaveButton />
          <button type="button" onClick={() => setEditing(false)} className={buttonSecondaryClass}>
            Anuluj
          </button>
        </div>
      </form>
    );
  }

  // "Ilość" is entered up front and doesn't require every pair to already
  // have its own item row via Intake — so the real total is whichever is
  // bigger: what was declared bought, or how many items actually got added
  // (covers the case items were added without ever setting quantity).
  const total = Math.max(batch.quantity ?? 0, batch.itemCount);
  const remaining = Math.max(0, total - batch.soldCount);

  return (
    <div className={`flex items-center gap-[var(--space-md)] ${cardClass}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-bold text-[var(--color-text)]">
          📦 {batch.label ?? batch.batchNumber}
        </span>
        <p className={`truncate text-sm ${mutedTextClass}`}>
          Koszt {batch.purchaseCost != null ? formatPln(batch.purchaseCost) : "—"}
          {batch.purchaseLocation ? ` · ${batch.purchaseLocation}` : ""}
          {batch.quantity != null ? ` · zakupiono: ${batch.quantity}` : ""}
          {" · dodano do systemu: "}
          {batch.itemCount}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-[var(--color-text)]">
          Zostało {remaining} {remaining === 1 ? "para" : "par"}
        </p>
        <p className={`text-xs ${mutedTextClass}`}>
          Sprzedano {batch.soldCount} z {total}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-full bg-[var(--color-surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] transition-opacity hover:opacity-80"
        >
          Edytuj
        </button>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="rounded-full bg-[var(--color-danger-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-danger)] transition-opacity hover:opacity-80"
        >
          Usuń
        </button>
      </div>
    </div>
  );
}

export function RealBatchesSection({ batches }: { batches: RealBatchRow[] }) {
  return (
    <div className="flex flex-col gap-[var(--space-md)]">
      <h2 className="text-lg font-semibold text-[var(--color-text)]">Partie zakupowe</h2>
      <p className={`text-sm ${mutedTextClass}`}>
        Partie utworzone przy przyjęciu towaru albo dodane ręcznie tutaj — nazwa
        i koszt zakupu do edycji.
      </p>
      <div className="flex flex-col gap-[var(--gap-default)]">
        {batches.map((batch) => (
          <RealBatchCard key={batch.id} batch={batch} />
        ))}
        {batches.length === 0 && (
          <p className={`text-sm ${mutedTextClass}`}>Brak partii.</p>
        )}
      </div>
      <div>
        <CreateBatchForm />
      </div>
    </div>
  );
}
