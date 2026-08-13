"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  updateBatchPurchaseCost,
  distributeBatchCost,
  deleteBatch,
  type BatchActionState,
} from "./actions";
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
  successTextClass,
} from "@/lib/ui-classes";

const initialState: BatchActionState = { status: "idle" };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonPrimaryClass}>
      {pending ? "Zapisywanie…" : "Zapisz"}
    </button>
  );
}

function DistributeButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonSecondaryClass}>
      {pending ? "Rozliczanie…" : "Rozlicz koszt"}
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

export function BatchCostForm({
  batchId,
  label,
  purchaseCost,
  itemCount,
  unpricedCount,
}: {
  batchId: string;
  label: string | null;
  purchaseCost: number | null;
  itemCount: number;
  unpricedCount: number;
}) {
  const [saveState, saveAction] = useActionState(
    updateBatchPurchaseCost,
    initialState
  );
  const [distributeState, distributeAction] = useActionState(
    distributeBatchCost,
    initialState
  );
  const [deleteState, deleteAction] = useActionState(deleteBatch, initialState);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className={`flex flex-col gap-4 ${cardClass}`}>
      <form action={saveAction} className="flex flex-col gap-3">
        <input type="hidden" name="batchId" value={batchId} />
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Nazwa partii</span>
          <input
            name="label"
            type="text"
            defaultValue={label ?? ""}
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
            defaultValue={purchaseCost ?? ""}
            className={`${inputClass} max-w-xs`}
          />
        </label>

        {saveState.status === "error" && (
          <p className={errorTextClass} role="alert">
            {saveState.error}
          </p>
        )}
        {saveState.status === "success" && (
          <p className={successTextClass}>Zapisano.</p>
        )}

        <div>
          <SaveButton />
        </div>
      </form>

      <form action={distributeAction} className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-4">
        <input type="hidden" name="batchId" value={batchId} />
        <p className={`text-xs ${mutedTextClass}`}>
          Towarów w partii: {itemCount}. Bez ustawionego kosztu:{" "}
          {unpricedCount}. Rozliczenie ustawi koszt tylko dla towarów bez
          kosztu (nie nadpisuje ręcznych poprawek).
        </p>

        {distributeState.status === "error" && (
          <p className={errorTextClass} role="alert">
            {distributeState.error}
          </p>
        )}
        {distributeState.status === "success" && (
          <p className={successTextClass}>Rozliczono koszt.</p>
        )}

        <div>
          <DistributeButton />
        </div>
      </form>

      <div className="border-t border-[var(--color-border)] pt-4">
        {!confirmingDelete ? (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className={buttonDangerClass}
          >
            Usuń partię
          </button>
        ) : (
          <div className={noticeDangerClass}>
            <p className="text-sm text-[var(--color-danger)]">
              Na pewno usunąć tę partię? Towary ({itemCount}) nie zostaną
              usunięte — zostaną tylko odłączone od partii.
            </p>
            {deleteState.status === "error" && (
              <p className={errorTextClass} role="alert">
                {deleteState.error}
              </p>
            )}
            <form action={deleteAction} className="flex gap-2">
              <input type="hidden" name="batchId" value={batchId} />
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
        )}
      </div>
    </div>
  );
}
