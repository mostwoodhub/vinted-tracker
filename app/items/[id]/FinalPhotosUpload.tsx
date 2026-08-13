"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { uploadFinalPhotos, type FinalPhotosState } from "./actions";
import { buttonPrimaryClass, errorTextClass, successTextClass } from "@/lib/ui-classes";
import { FileDropzone } from "@/app/FileDropzone";

const initialState: FinalPhotosState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonPrimaryClass}>
      {pending ? "Przesyłanie…" : "Prześlij zdjęcia"}
    </button>
  );
}

export function FinalPhotosUpload({ itemId }: { itemId: string }) {
  const [state, formAction] = useActionState(uploadFinalPhotos, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="itemId" value={itemId} />
      <FileDropzone name="photos" accept="image/*" multiple label="Kliknij lub przeciągnij zdjęcia tutaj" />

      {state.status === "error" && (
        <p className={errorTextClass} role="alert">
          {state.error}
        </p>
      )}
      {state.status === "success" && (
        <p className={successTextClass}>Zdjęcia zapisane.</p>
      )}

      <SubmitButton />
    </form>
  );
}
