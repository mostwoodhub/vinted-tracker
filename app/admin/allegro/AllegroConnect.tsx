"use client";

import { useActionState } from "react";
import {
  startAllegroDeviceFlowAction,
  confirmAllegroDeviceFlowAction,
  type StartDeviceFlowState,
  type ConfirmDeviceFlowState,
} from "./actions";
import { buttonPrimaryClass, buttonSecondaryClass, errorTextClass, mutedTextClass, successTextClass } from "@/lib/ui-classes";

const startInitialState: StartDeviceFlowState = { status: "idle" };
const confirmInitialState: ConfirmDeviceFlowState = { status: "idle" };

export function AllegroConnect({ connected }: { connected: boolean }) {
  const [startState, startAction, startPending] = useActionState(
    startAllegroDeviceFlowAction,
    startInitialState
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmAllegroDeviceFlowAction,
    confirmInitialState
  );

  if (confirmState.status === "connected") {
    return <p className={successTextClass}>✓ Konto Allegro zostało połączone.</p>;
  }

  if (startState.status !== "started") {
    return (
      <form action={startAction} className="flex flex-col gap-2">
        <button type="submit" disabled={startPending} className={`w-fit ${buttonPrimaryClass}`}>
          {startPending ? "Łączenie…" : connected ? "Połącz ponownie" : "Połącz z Allegro"}
        </button>
        {startState.status === "error" && <p className={errorTextClass}>{startState.error}</p>}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-[var(--color-text)]">
        Otwórz link, zaloguj się na Allegro (jeśli trzeba) i zatwierdź dostęp. Kod do
        potwierdzenia: <strong>{startState.userCode}</strong>
      </p>
      <a
        href={startState.verificationUriComplete}
        target="_blank"
        rel="noreferrer"
        className={`w-fit ${buttonSecondaryClass}`}
      >
        Otwórz stronę zatwierdzenia Allegro
      </a>

      <form action={confirmAction} className="flex flex-col gap-2">
        <input type="hidden" name="deviceCode" value={startState.deviceCode} />
        <button type="submit" disabled={confirmPending} className={`w-fit ${buttonPrimaryClass}`}>
          {confirmPending ? "Sprawdzanie…" : "Sprawdziłem, kontynuuj"}
        </button>
        {confirmState.status === "pending" && (
          <p className={mutedTextClass}>
            Jeszcze nie zatwierdzono dostępu na Allegro — zatwierdź na otwartej stronie i
            spróbuj ponownie.
          </p>
        )}
        {confirmState.status === "error" && <p className={errorTextClass}>{confirmState.error}</p>}
      </form>
    </div>
  );
}
