"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { retryAiCard, type RetryAiCardState } from "./actions";
import {
  buttonWarningOutlineClass,
  errorTextClass,
  noticeWarningClass,
  successTextClass,
} from "@/lib/ui-classes";

const initialState: RetryAiCardState = { status: "idle" };

function Button() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonWarningOutlineClass}>
      {pending ? "Generowanie…" : "Generuj kartę AI ponownie"}
    </button>
  );
}

export function RetryAiCardButton({ itemId }: { itemId: string }) {
  const [state, formAction] = useActionState(retryAiCard, initialState);

  return (
    <form action={formAction} className={noticeWarningClass}>
      <input type="hidden" name="itemId" value={itemId} />
      <p>
        Zdjęcia są przesłane, ale karta AI jeszcze nie powstała. Generowanie
        w tle mogło się nie powieść.
      </p>

      {state.status === "error" && (
        <p className={errorTextClass} role="alert">
          {state.error}
        </p>
      )}
      {state.status === "success" && (
        <p className={successTextClass}>Karta AI wygenerowana.</p>
      )}

      <div>
        <Button />
      </div>
    </form>
  );
}
