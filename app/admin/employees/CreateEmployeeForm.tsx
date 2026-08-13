"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { createEmployee, type CreateEmployeeState } from "./actions";
import { ALL_ROLES } from "@/lib/roles";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  cardClass,
  errorTextClass,
  inputClass,
  labelClass,
  noticeSuccessClass,
} from "@/lib/ui-classes";

const initialState: CreateEmployeeState = { status: "idle" };

function generatePassword() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonPrimaryClass}>
      {pending ? "Tworzenie…" : "Utwórz pracownika"}
    </button>
  );
}

export function CreateEmployeeForm() {
  const [state, formAction] = useActionState(createEmployee, initialState);
  const passwordRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`flex flex-col gap-4 ${cardClass}`}>
      <h2 className="text-sm font-medium text-[var(--color-text)]">
        Nowy pracownik
      </h2>

      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Imię i nazwisko</span>
          <input name="fullName" type="text" required className={inputClass} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>E-mail</span>
          <input name="email" type="email" required className={inputClass} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Hasło tymczasowe</span>
          <div className="flex gap-2">
            <input
              ref={passwordRef}
              name="password"
              type="text"
              required
              minLength={8}
              className={`${inputClass} flex-1`}
            />
            <button
              type="button"
              onClick={() => {
                if (passwordRef.current) {
                  passwordRef.current.value = generatePassword();
                }
              }}
              className={buttonSecondaryClass}
            >
              Wygeneruj
            </button>
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Rola podstawowa</span>
          <select name="role" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Wybierz rolę
            </option>
            {ALL_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>

        {state.status === "error" && (
          <p className={errorTextClass} role="alert">
            {state.error}
          </p>
        )}

        <div>
          <SubmitButton />
        </div>
      </form>

      {state.status === "success" && (
        <div className={noticeSuccessClass}>
          <p className="font-medium">
            Utworzono pracownika: {state.fullName}
          </p>
          <p>
            E-mail: <strong>{state.email}</strong>
          </p>
          <p>
            Hasło tymczasowe: <strong>{state.password}</strong>
          </p>
          <p className="text-xs">
            Zapisz to hasło teraz — nie zostanie ponownie pokazane.
            Pracownik powinien zmienić je przy pierwszym logowaniu.
          </p>
        </div>
      )}
    </div>
  );
}
