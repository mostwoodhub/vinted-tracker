"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createPhotoSet,
  uploadPhotosToSet,
  deletePhotoSet,
  type PhotoSetState,
} from "./photo-set-actions";
import { autoCropPhoto, type CropState } from "./crop-actions";
import { FileDropzone } from "@/app/FileDropzone";
import { DownloadPhotoButton } from "@/app/DownloadPhotoButton";
import {
  buttonDangerClass,
  buttonPrimaryClass,
  buttonSecondaryClass,
  cardSmClass,
  errorTextClass,
  inputClass,
  labelClass,
  mutedTextClass,
} from "@/lib/ui-classes";

export type PhotoSetPhoto = { id: string; url: string };

export type PhotoSetData = {
  id: string;
  label: string | null;
  accountName: string | null;
};

const createInitial: PhotoSetState = { status: "idle" };
const uploadInitial: PhotoSetState = { status: "idle" };
const deleteInitial: PhotoSetState = { status: "idle" };
const cropInitial: CropState = { status: "idle" };

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonPrimaryClass}>
      {pending ? "Tworzenie…" : "+ Nowy zestaw zdjęć"}
    </button>
  );
}

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonPrimaryClass}>
      {pending ? "Przesyłanie…" : "Prześlij zdjęcia"}
    </button>
  );
}

function DeleteSetButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonDangerClass}>
      {pending ? "Usuwanie…" : "Usuń zestaw"}
    </button>
  );
}

function CropButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title="Przytnij automatycznie tło wokół produktu"
      className="rounded-full bg-black/60 px-1.5 py-0.5 text-xs text-white hover:bg-black/80 disabled:opacity-60"
    >
      {pending ? "…" : "✂️"}
    </button>
  );
}

function PhotoTile({ itemId, photo }: { itemId: string; photo: PhotoSetPhoto }) {
  const [state, action] = useActionState(autoCropPhoto, cropInitial);

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt=""
          className="aspect-square w-full rounded-[var(--radius-sm)] object-cover"
        />
        <div className="absolute bottom-1 left-1">
          <DownloadPhotoButton url={photo.url} filename={`${photo.id}.jpg`} />
        </div>
        <form action={action} className="absolute bottom-1 right-1">
          <input type="hidden" name="photoId" value={photo.id} />
          <input type="hidden" name="itemId" value={itemId} />
          <CropButton />
        </form>
      </div>
      {state.status === "error" && (
        <span className="text-xs text-[var(--color-danger)]">{state.error}</span>
      )}
      {state.status === "success" && (
        <span className="text-xs text-[var(--color-success)]">Przycięto.</span>
      )}
    </div>
  );
}

function PhotoSetUploadForm({ itemId, setId }: { itemId: string; setId: string }) {
  const [state, formAction] = useActionState(uploadPhotosToSet, uploadInitial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="photoSetId" value={setId} />
      <FileDropzone name="photos" accept="image/*" multiple label="Dodaj zdjęcia do tego zestawu" />
      {state.status === "error" && (
        <p className={errorTextClass} role="alert">
          {state.error}
        </p>
      )}
      <UploadButton />
    </form>
  );
}

function PhotoSetCard({
  itemId,
  set,
  photos,
}: {
  itemId: string;
  set: PhotoSetData;
  photos: PhotoSetPhoto[];
}) {
  const [deleteState, deleteAction] = useActionState(deletePhotoSet, deleteInitial);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className={`flex flex-col gap-3 ${cardSmClass}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-[var(--color-text)]">
            {set.label || "Zestaw zdjęć"}
          </span>
          <span className={`text-xs ${mutedTextClass}`}>
            {set.accountName ? `Konto: ${set.accountName}` : "Nieprzypisany do konta"}
          </span>
        </div>

        {confirmingDelete ? (
          <form action={deleteAction} className="flex items-center gap-2">
            <input type="hidden" name="itemId" value={itemId} />
            <input type="hidden" name="photoSetId" value={set.id} />
            <DeleteSetButton />
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className={buttonSecondaryClass}
            >
              Anuluj
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded-full bg-[var(--color-danger-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-danger)] transition-opacity hover:opacity-80"
          >
            Usuń
          </button>
        )}
      </div>

      {deleteState.status === "error" && (
        <p className={errorTextClass} role="alert">
          {deleteState.error}
        </p>
      )}

      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <PhotoTile key={photo.id} itemId={itemId} photo={photo} />
          ))}
        </div>
      ) : (
        <p className={`text-sm ${mutedTextClass}`}>Brak zdjęć w tym zestawie.</p>
      )}

      <PhotoSetUploadForm itemId={itemId} setId={set.id} />
    </div>
  );
}

function CreatePhotoSetForm({
  itemId,
  accountNames,
}: {
  itemId: string;
  accountNames: string[];
}) {
  const [state, formAction] = useActionState(createPhotoSet, createInitial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className={`flex flex-col gap-3 ${cardSmClass}`}>
      <input type="hidden" name="itemId" value={itemId} />
      <span className={labelClass}>+ Nowy zestaw zdjęć</span>
      <div className="flex flex-wrap gap-2">
        <input
          name="label"
          type="text"
          placeholder="np. Białe tło"
          className={`${inputClass} max-w-xs`}
        />
        <select name="accountName" defaultValue="" className={`${inputClass} max-w-xs`}>
          <option value="">Bez konta (na razie)</option>
          {accountNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <CreateButton />
      </div>
      {state.status === "error" && (
        <p className={errorTextClass} role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function PhotoSetsManager({
  itemId,
  accountNames,
  sets,
  photosBySet,
}: {
  itemId: string;
  accountNames: string[];
  sets: PhotoSetData[];
  photosBySet: Map<string, PhotoSetPhoto[]>;
}) {
  return (
    <div className="flex flex-col gap-3">
      {sets.map((set) => (
        <PhotoSetCard
          key={set.id}
          itemId={itemId}
          set={set}
          photos={photosBySet.get(set.id) ?? []}
        />
      ))}
      {sets.length === 0 && (
        <p className={`text-sm ${mutedTextClass}`}>
          Brak zestawów zdjęć. Utwórz pierwszy, żeby dodać zdjęcia finalne (np. na
          różnych tłach dla różnych kont).
        </p>
      )}
      <CreatePhotoSetForm itemId={itemId} accountNames={accountNames} />
    </div>
  );
}
