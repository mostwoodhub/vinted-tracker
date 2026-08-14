"use client";

import { useActionState, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { login, type LoginState } from "./actions";
import { createClient } from "@/lib/supabase/client";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  errorTextClass,
  inputClass,
  labelClass,
  mutedTextClass,
  successTextClass,
} from "@/lib/ui-classes";

const initialState: LoginState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonPrimaryClass}>
      {pending ? "Logowanie…" : "Zaloguj się"}
    </button>
  );
}

function ForgotPassword() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`self-start text-xs ${mutedTextClass} underline hover:text-[var(--color-text)]`}
      >
        Zapomniałeś hasła?
      </button>
    );
  }

  if (status === "sent") {
    return (
      <p className={`text-xs ${successTextClass}`}>
        Jeśli takie konto istnieje, wysłaliśmy link do resetu hasła na {email}.
      </p>
    );
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setError(null);

    const supabase = createClient();
    const { error: sendError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (sendError) {
      setStatus("error");
      setError(sendError.message);
      return;
    }

    setStatus("sent");
  }

  return (
    <form onSubmit={handleSend} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className={`text-xs ${mutedTextClass}`}>E-mail do resetu hasła</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={inputClass}
        />
      </label>
      {status === "error" && (
        <p className={errorTextClass} role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={status === "sending"}
          className={buttonSecondaryClass}
        >
          {status === "sending" ? "Wysyłanie…" : "Wyślij link"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonSecondaryClass}>
          Anuluj
        </button>
      </div>
    </form>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(login, initialState);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className={labelClass}>
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className={labelClass}>
            Hasło
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </div>

        {state.status === "error" && (
          <p className={errorTextClass} role="alert">
            {state.error}
          </p>
        )}

        <SubmitButton />
      </form>

      <ForgotPassword />
    </div>
  );
}
