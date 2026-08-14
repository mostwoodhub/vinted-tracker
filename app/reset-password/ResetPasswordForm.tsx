"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  buttonPrimaryClass,
  errorTextClass,
  inputClass,
  labelClass,
  mutedTextClass,
  successTextClass,
} from "@/lib/ui-classes";

export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // The recovery link carries the session in the URL hash fragment (never
    // sent to the server). The browser client picks it up automatically and
    // fires PASSWORD_RECOVERY once that session is live — until then we
    // don't show the form, otherwise an expired/reused link would just fail
    // silently on submit instead of explaining what happened.
    const supabase = createClient();

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Hasło musi mieć min. 8 znaków");
      return;
    }
    if (password !== confirm) {
      setError("Hasła nie są takie same");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    // The recovery session lives only in the browser (localStorage), not in
    // the server-side cookie the rest of the app relies on — sign out of it
    // and send them to the normal login form so a real cookie session gets
    // established.
    await supabase.auth.signOut();
    setTimeout(() => router.push("/login"), 1500);
  }

  if (success) {
    return (
      <p className={successTextClass}>Hasło zmienione. Przekierowuję do logowania…</p>
    );
  }

  if (!ready) {
    return (
      <p className={`text-sm ${mutedTextClass}`}>
        Sprawdzam link resetujący… Jeśli nic się nie dzieje po chwili, link mógł
        wygasnąć lub był już użyty — poproś o nowy na stronie logowania.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={labelClass}>
          Nowe hasło
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm" className={labelClass}>
          Powtórz nowe hasło
        </label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={8}
          required
          className={inputClass}
        />
      </div>

      {error && (
        <p className={errorTextClass} role="alert">
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting} className={buttonPrimaryClass}>
        {submitting ? "Zapisywanie…" : "Ustaw nowe hasło"}
      </button>
    </form>
  );
}
