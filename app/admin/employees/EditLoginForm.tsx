"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { updateEmployeeLogin, type UpdateLoginState } from "./actions";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  errorTextClass,
  inputClass,
  labelClass,
} from "@/lib/ui-classes";

const initialState: UpdateLoginState = { status: "idle" };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonPrimaryClass}>
      {pending ? "Zapisywanie…" : "Zapisz"}
    </button>
  );
}

export function EditLoginForm({
  employeeId,
  email,
}: {
  employeeId: string;
  email: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(updateEmployeeLogin, initialState);

  // Adjust state during render (React-sanctioned pattern) instead of an
  // effect, to close the form the moment a save succeeds — without this
  // guard, reopening the form later would immediately auto-close it again
  // since `state` stays "success" from the last submit.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success" && editing) setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-text)]">
          {email ?? <span className="text-[var(--color-text-muted)]">Brak konta logowania</span>}
        </p>
        {email && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full bg-[var(--color-surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] transition-opacity hover:opacity-80"
          >
            Edytuj dane logowania
          </button>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="employeeId" value={employeeId} />

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>E-mail</span>
        <input
          name="email"
          type="email"
          required
          defaultValue={email ?? ""}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Nowe hasło (opcjonalnie)</span>
        <input
          name="password"
          type="text"
          minLength={8}
          placeholder="Zostaw puste, aby nie zmieniać"
          className={inputClass}
        />
      </label>

      {state.status === "error" && (
        <p className={errorTextClass} role="alert">
          {state.error}
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
