"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { PeriodFilterControl } from "@/app/PeriodFilterControl";
import { defaultPeriodFilter, matchesPeriod, type PeriodFilterState } from "@/lib/period-filter";
import { formatPln } from "@/lib/format";
import { createExpense, updateExpense, deleteExpense, type ExpenseActionState } from "./actions";
import { EXPENSE_CATEGORY_ROWS } from "@/lib/expense-categories";
import {
  buttonDangerClass,
  buttonPrimaryClass,
  buttonSecondaryClass,
  cardClass,
  errorTextClass,
  headingClass,
  inputClass,
  labelClass,
  mutedTextClass,
  pageWrapClass,
} from "@/lib/ui-classes";

export type ExpenseRow = {
  id: string;
  expense_date: string | null;
  category: string | null;
  description: string | null;
  amount: number | null;
  batch_name: string | null;
};

const initialState: ExpenseActionState = { status: "idle" };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonPrimaryClass}>
      {pending ? "Zapisywanie…" : label}
    </button>
  );
}

function ExpenseFields({ expense }: { expense?: ExpenseRow }) {
  // Older rows (the 2025 archive import, anything entered outside this
  // form) can carry a category string that isn't one of the four real
  // options — without this, opening and re-saving one would silently
  // overwrite it with whatever option happens to render first.
  const isCustomCategory =
    !!expense?.category && !EXPENSE_CATEGORY_ROWS.some((row) => row.key === expense.category);

  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Data</span>
        <input
          name="expenseDate"
          type="date"
          required
          defaultValue={expense?.expense_date ?? todayIso()}
          className={`${inputClass} max-w-xs`}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Kategoria</span>
        <select
          name="category"
          required
          defaultValue={expense?.category ?? EXPENSE_CATEGORY_ROWS[0].key}
          className={`${inputClass} max-w-xs`}
        >
          {isCustomCategory && (
            <option value={expense!.category!}>{expense!.category} (zachowaj)</option>
          )}
          {EXPENSE_CATEGORY_ROWS.map((row) => (
            <option key={row.key} value={row.key}>
              {row.emoji} {row.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Opis</span>
        <input
          name="description"
          type="text"
          defaultValue={expense?.description ?? ""}
          placeholder="np. czynsz, kurier, folia"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1.5 max-w-xs">
        <span className={labelClass}>Kwota (zł)</span>
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          defaultValue={expense?.amount ?? ""}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1.5 max-w-xs">
        <span className={labelClass}>Partia (opcjonalnie)</span>
        <input
          name="batchName"
          type="text"
          defaultValue={expense?.batch_name ?? ""}
          placeholder="np. T, AA — dotyczy zakupu obuwia"
          className={inputClass}
        />
      </label>
    </>
  );
}

function CreateExpenseForm() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createExpense, initialState);
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success" && open) setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonSecondaryClass}>
        + Dodaj wydatek
      </button>
    );
  }

  return (
    <form action={action} className={`flex flex-col gap-3 ${cardClass}`}>
      <ExpenseFields />
      {state.status === "error" && (
        <p className={errorTextClass} role="alert">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <SaveButton label="Dodaj wydatek" />
        <button type="button" onClick={() => setOpen(false)} className={buttonSecondaryClass}>
          Anuluj
        </button>
      </div>
    </form>
  );
}

function ExpenseCard({ expense }: { expense: ExpenseRow }) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saveState, saveAction] = useActionState(updateExpense, initialState);
  const [deleteState, deleteAction] = useActionState(deleteExpense, initialState);

  const [handledSaveState, setHandledSaveState] = useState(saveState);
  if (saveState !== handledSaveState) {
    setHandledSaveState(saveState);
    if (saveState.status === "success" && editing) setEditing(false);
  }

  const categoryRow = EXPENSE_CATEGORY_ROWS.find((row) => row.key === expense.category);

  if (confirmingDelete) {
    return (
      <div className={`flex flex-col gap-3 ${cardClass}`}>
        <p className="text-sm text-[var(--color-danger)]">
          Na pewno usunąć wydatek „{expense.description || expense.category}”?
        </p>
        {deleteState.status === "error" && (
          <p className={errorTextClass} role="alert">
            {deleteState.error}
          </p>
        )}
        <form action={deleteAction} className="flex gap-2">
          <input type="hidden" name="expenseId" value={expense.id} />
          <button type="submit" className={buttonDangerClass}>
            Usuń
          </button>
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
        <input type="hidden" name="expenseId" value={expense.id} />
        <ExpenseFields expense={expense} />
        {saveState.status === "error" && (
          <p className={errorTextClass} role="alert">
            {saveState.error}
          </p>
        )}
        <div className="flex gap-2">
          <SaveButton label="Zapisz" />
          <button type="button" onClick={() => setEditing(false)} className={buttonSecondaryClass}>
            Anuluj
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={`flex items-center gap-[var(--space-md)] ${cardClass}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-[var(--color-text)]">
            {expense.description || "—"}
          </span>
          {expense.category && (
            <span className="rounded-full bg-[var(--color-warning-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-warning)]">
              {categoryRow ? `${categoryRow.emoji} ${categoryRow.label}` : expense.category}
            </span>
          )}
        </div>
        <p className={`truncate text-sm ${mutedTextClass}`}>
          {expense.expense_date ?? "—"}
          {expense.batch_name ? ` · partia ${expense.batch_name}` : ""}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <p className="text-xl font-bold text-[var(--color-danger)]">
          {formatPln(expense.amount)}
        </p>
        <div className="flex gap-2">
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
    </div>
  );
}

export function ExpensesView({ expenses }: { expenses: ExpenseRow[] }) {
  const [period, setPeriod] = useState<PeriodFilterState>(defaultPeriodFilter());

  const filtered = useMemo(
    () => expenses.filter((expense) => matchesPeriod(expense.expense_date, period)),
    [expenses, period]
  );

  const total = useMemo(
    () => filtered.reduce((sum, expense) => sum + (expense.amount ?? 0), 0),
    [filtered]
  );

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-[var(--space-lg)] px-6 py-12">
        <h1 className={headingClass}>Wydatki</h1>

        <PeriodFilterControl value={period} onChange={setPeriod} />

        <p className={`text-sm ${mutedTextClass}`}>
          {filtered.length} {filtered.length === 1 ? "wydatek" : "wydatków"} · razem{" "}
          <span className="font-medium text-[var(--color-danger)]">
            {formatPln(total)}
          </span>
        </p>

        <div className="flex flex-col gap-[var(--gap-default)]">
          {filtered.map((expense) => (
            <ExpenseCard key={expense.id} expense={expense} />
          ))}

          {filtered.length === 0 && (
            <div className={`text-center text-sm ${mutedTextClass} ${cardClass}`}>
              Brak wydatków spełniających kryteria.
            </div>
          )}
        </div>

        <div>
          <CreateExpenseForm />
        </div>
      </div>
    </div>
  );
}
