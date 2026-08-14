"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createAccount,
  renameAccount,
  deleteAccount,
  importArchiwum2025,
  type AccountActionState,
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
} from "@/lib/ui-classes";

const initialState: AccountActionState = { status: "idle" };

export type AccountRow = {
  id: string;
  name: string;
  saleCount: number;
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
      {pending ? "Usuwanie…" : "Usuń konto"}
    </button>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonPrimaryClass}>
      {pending ? "Dodawanie…" : "Dodaj"}
    </button>
  );
}

function AccountCard({ account }: { account: AccountRow }) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [renameState, renameAction] = useActionState(renameAccount, initialState);
  const [deleteState, deleteAction] = useActionState(deleteAccount, initialState);

  const [handledRenameState, setHandledRenameState] = useState(renameState);
  if (renameState !== handledRenameState) {
    setHandledRenameState(renameState);
    if (renameState.status === "success" && editing) setEditing(false);
  }

  if (confirmingDelete) {
    return (
      <div className={noticeDangerClass}>
        <p className="text-sm text-[var(--color-danger)]">
          Na pewno usunąć konto {account.name}? Sprzedaże ({account.saleCount})
          nie zostaną usunięte — zachowają nazwę konta jako historyczny wpis.
        </p>
        {deleteState.status === "error" && (
          <p className={errorTextClass} role="alert">
            {deleteState.error}
          </p>
        )}
        <form action={deleteAction} className="flex gap-2">
          <input type="hidden" name="accountId" value={account.id} />
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
      <form action={renameAction} className={`flex flex-col gap-3 ${cardClass}`}>
        <input type="hidden" name="accountId" value={account.id} />
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Nazwa konta</span>
          <input
            name="name"
            type="text"
            required
            defaultValue={account.name}
            className={`${inputClass} max-w-xs`}
          />
        </label>
        {renameState.status === "error" && (
          <p className={errorTextClass} role="alert">
            {renameState.error}
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

  return (
    <div className={`flex items-center gap-[var(--space-md)] ${cardClass}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-bold text-[var(--color-text)]">{account.name}</span>
        <p className={`truncate text-sm ${mutedTextClass}`}>
          {account.saleCount} {account.saleCount === 1 ? "sprzedaż" : "sprzedaży"}
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

function ImportButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonSecondaryClass}>
      {pending ? "Importowanie…" : "Zaimportuj raport 2025 (jednorazowo)"}
    </button>
  );
}

function ArchiwumSection({ archiwumImported }: { archiwumImported: boolean }) {
  const [importState, importAction] = useActionState(importArchiwum2025, initialState);

  return (
    <div className={`flex flex-col gap-3 ${cardClass}`}>
      <span className={labelClass}>📥 Archiwum</span>
      {archiwumImported || importState.status === "success" ? (
        <p className={`text-sm ${mutedTextClass}`}>
          Raport 2025 już zaimportowany na konto &quot;Archiwum 2025&quot;.
        </p>
      ) : (
        <form action={importAction} className="flex flex-col gap-2">
          <ImportButton />
          <p className={`text-sm ${mutedTextClass}`}>
            Doda 12 zbiorczych wpisów miesięcznych (styczeń–grudzień 2025) na konto
            &quot;Archiwum 2025&quot;, żeby dane pojawiły się w statystykach i na wykresach. To nie
            są pojedyncze sprzedaże, tylko sumy z raportu rocznego.
          </p>
          {importState.status === "error" && (
            <p className={errorTextClass} role="alert">
              {importState.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

function AddAccountForm() {
  const [createState, createAction] = useActionState(createAccount, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (createState.status === "success") formRef.current?.reset();
  }, [createState]);

  return (
    <form ref={formRef} action={createAction} className={`flex flex-col gap-3 ${cardClass}`}>
      <span className={labelClass}>+ Nowe konto</span>
      <div className="flex flex-wrap gap-2">
        <input
          name="name"
          type="text"
          placeholder="np. Konto 7"
          className={`${inputClass} max-w-xs`}
        />
        <AddButton />
      </div>
      {createState.status === "error" && (
        <p className={errorTextClass} role="alert">
          {createState.error}
        </p>
      )}
    </form>
  );
}

export function AccountsSection({
  accounts,
  archiwumImported,
}: {
  accounts: AccountRow[];
  archiwumImported: boolean;
}) {
  return (
    <div className="flex flex-col gap-[var(--space-md)]">
      <ArchiwumSection archiwumImported={archiwumImported} />
      <div className="flex flex-col gap-[var(--gap-default)]">
        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
        {accounts.length === 0 && (
          <p className={`text-sm ${mutedTextClass}`}>Brak kont.</p>
        )}
      </div>
      <AddAccountForm />
    </div>
  );
}
