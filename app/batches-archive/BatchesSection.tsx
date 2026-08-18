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

export type BatchRow = {
  // null = not yet a real `batches` row — a purchase cost was logged for
  // this letter in the old expenses-based system, but nothing here to
  // edit/delete until someone saves it (which creates the row).
  id: string | null;
  label: string;
  batchNumber: number | null;
  purchaseCost: number | null;
  purchaseLocation: string | null;
  quantity: number | null;
  salesAmount: number | null;
  soldPairs: number | null;
  itemCount: number;
  soldCount: number;
  // Sales found live in the `sales` table matching this batch's letter
  // prefix — added on top of salesAmount/soldPairs, not a replacement.
  linkedSalesAmount: number;
  linkedSalesCount: number;
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
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Sprzedaż razem (informacyjnie)</span>
        <input
          name="salesAmount"
          type="number"
          step="0.01"
          min="0"
          className={`${inputClass} max-w-xs`}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Sprzedano par (informacyjnie)</span>
        <input
          name="soldPairs"
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

function BatchCard({ batch }: { batch: BatchRow }) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saveState, saveAction] = useActionState(updateBatchPurchaseCost, initialState);
  const [deleteState, deleteAction] = useActionState(deleteBatch, initialState);
  // A batch with no real `batches` row yet (id === null) saves by creating
  // one instead of updating — "adopts" the old expenses-tracked batch into
  // the real system the first time someone edits it.
  const [createState, createAction] = useActionState(createBatch, initialState);
  const editAction = batch.id ? saveAction : createAction;
  const editState = batch.id ? saveState : createState;

  // Adjust state during render (React-sanctioned pattern) instead of an
  // effect, to close the edit form the moment a save succeeds.
  const [handledEditState, setHandledEditState] = useState(editState);
  if (editState !== handledEditState) {
    setHandledEditState(editState);
    if (editState.status === "success" && editing) setEditing(false);
  }

  if (confirmingDelete && batch.id) {
    return (
      <div className={noticeDangerClass}>
        <p className="text-sm text-[var(--color-danger)]">
          Na pewno usunąć partię {batch.label}? Towary ({batch.itemCount}) nie
          zostaną usunięte — zostaną tylko odłączone od partii.
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
      <form action={editAction} className={`flex flex-col gap-3 ${cardClass}`}>
        {batch.id && <input type="hidden" name="batchId" value={batch.id} />}
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Nazwa partii</span>
          <input
            name="label"
            type="text"
            required={!batch.id}
            defaultValue={batch.label}
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
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Sprzedaż razem (informacyjnie)</span>
          <input
            name="salesAmount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={batch.salesAmount ?? ""}
            className={`${inputClass} max-w-xs`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Sprzedano par (informacyjnie)</span>
          <input
            name="soldPairs"
            type="number"
            step="1"
            min="0"
            defaultValue={batch.soldPairs ?? ""}
            className={`${inputClass} max-w-xs`}
          />
        </label>
        {editState.status === "error" && (
          <p className={errorTextClass} role="alert">
            {editState.error}
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
  // Manually entered soldPairs (spreadsheet baseline) plus whatever the live
  // `sales` table has matched to this batch since, then real item statuses
  // win if that's somehow bigger (covers items tracked via Intake).
  const manualPlusLinkedSold = (batch.soldPairs ?? 0) + batch.linkedSalesCount;
  const effectiveSold = Math.max(batch.soldCount, manualPlusLinkedSold);
  const remaining = Math.max(0, total - effectiveSold);

  // Sales total is whatever manual/spreadsheet baseline exists (money
  // already collected before this system tracked sales, or before this
  // batch had a real row at all) plus everything found live in the `sales`
  // table by shoe-id prefix since.
  const hasCostData = batch.purchaseCost != null;
  const cost = batch.purchaseCost ?? 0;
  const sales = (batch.salesAmount ?? 0) + batch.linkedSalesAmount;
  const recoveredPct = cost > 0 ? Math.round(Math.min(1, sales / cost) * 100) : sales > 0 ? 100 : 0;
  const breakEvenReached = sales >= cost;
  const remainingAmount = Math.abs(cost - sales);

  return (
    <div className={`flex flex-col gap-3 ${cardClass}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold text-[var(--color-text)]">
          📦 Partia {batch.label}
        </span>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full bg-[var(--color-surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] transition-opacity hover:opacity-80"
          >
            Edytuj
          </button>
          {batch.id && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded-full bg-[var(--color-danger-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-danger)] transition-opacity hover:opacity-80"
            >
              Usuń
            </button>
          )}
        </div>
      </div>

      {hasCostData && (
        <>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
            <div
              className="h-full rounded-full bg-[var(--color-accent)]"
              style={{ width: `${recoveredPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`text-xs ${mutedTextClass}`}>Koszt partii</p>
              <p className="font-semibold text-[var(--color-warning)]">
                {formatPln(batch.purchaseCost)}
              </p>
            </div>
            <div className="text-right">
              <p className={`text-xs ${mutedTextClass}`}>Sprzedaż razem</p>
              <p className="font-semibold text-[var(--color-success)]">
                {formatPln(sales)}
              </p>
              {batch.linkedSalesAmount > 0 && (
                <p className={`text-xs ${mutedTextClass}`}>
                  w tym {formatPln(batch.linkedSalesAmount)} z {batch.linkedSalesCount} sprzedaży w systemie
                </p>
              )}
            </div>
          </div>

          <div className="border-t border-[var(--color-border)] pt-2">
            <p className={`text-xs ${mutedTextClass}`}>
              {breakEvenReached ? "Zysk ponad koszt" : "Pozostało do spłaty"}
            </p>
            <p
              className={`text-lg font-bold ${
                breakEvenReached
                  ? "text-[var(--color-success)]"
                  : "text-[var(--color-danger)]"
              }`}
            >
              {breakEvenReached ? "+" : "-"}
              {formatPln(remainingAmount)}
            </p>
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-2">
        <p className={`truncate text-sm ${mutedTextClass}`}>
          {batch.purchaseLocation ?? ""}
          {batch.purchaseLocation && batch.quantity != null ? " · " : ""}
          {batch.quantity != null ? `zakupiono: ${batch.quantity}` : ""}
        </p>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-[var(--color-text)]">
            Zostało {remaining} {remaining === 1 ? "para" : "par"}
          </p>
          <p className={`text-xs ${mutedTextClass}`}>
            Sprzedano {effectiveSold} z {total}
          </p>
        </div>
      </div>
    </div>
  );
}

export function BatchesSection({ batches }: { batches: BatchRow[] }) {
  return (
    <div className="flex flex-col gap-[var(--space-md)]">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">Partie</h1>
      <p className={`text-sm ${mutedTextClass}`}>
        Wszystkie partie zakupowe firmy w jednym miejscu — koszt vs.
        sprzedaż dopasowana po prefiksie numeru obuwia, niezależnie czy
        partia pochodzi ze starego systemu czy została dodana tutaj.
      </p>
      <div className="flex flex-col gap-[var(--gap-default)]">
        {batches.map((batch) => (
          <BatchCard key={batch.id ?? batch.label} batch={batch} />
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
