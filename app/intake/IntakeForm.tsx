"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createItem, type IntakeState } from "./actions";
import { FileDropzone } from "@/app/FileDropzone";
import { formatItemNumber } from "@/lib/item-number";
import { parseShoeId } from "@/lib/item-sale-match";
import { CONDITIONS, CONDITION_DETAIL_OPTIONS } from "@/lib/condition-options";
import {
  buttonPrimaryClass,
  checkboxClass,
  errorTextClass,
  headingClass,
  inputClass,
  labelClass,
  mutedTextClass,
  noticeSuccessClass,
  noticeWarningClass,
  pageWrapClass,
} from "@/lib/ui-classes";

const DEFECTS = [
  "Zarysowania",
  "Zabrudzenia",
  "Stan podeszwy",
  "Brak wkładki",
  "Zapach",
  "Deformacja",
  "Dziurki na zapiętkach (lub 1 na 1 zapiętce)",
  "Trzeba podkleić",
];

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonPrimaryClass}>
      {pending ? "Zapisywanie…" : "Zapisz"}
    </button>
  );
}

const initialState: IntakeState = { status: "idle" };

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function printLabel(state: IntakeState) {
  const printWindow = window.open("", "_blank", "width=400,height=300");
  if (!printWindow) return;

  const brand = escapeHtml(state.brand ?? "");
  const size = escapeHtml(state.size ?? "");
  const defectsLine = escapeHtml(state.defectsSummary || "Brak wad");

  const displayNumber = escapeHtml(
    formatItemNumber(state.batchLabel, state.internalNumber ?? "")
  );

  printWindow.document.write(`<!doctype html>
<html>
  <head>
    <title>Etykieta ${displayNumber}</title>
    <style>
      @page { size: 80mm 50mm; margin: 4mm; }
      body { font-family: Arial, sans-serif; margin: 0; }
      .number { font-size: 28px; font-weight: 700; }
      .line {
        font-size: 13px;
        margin-top: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    </style>
  </head>
  <body>
    <div class="number">${displayNumber}</div>
    <div class="line">${brand} · ${size}</div>
    <div class="line">${defectsLine}</div>
  </body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

type IntakeFormProps = {
  brands: string[];
  sizes: string[];
  batchLabels: string[];
  heading?: string;
  suggestedLegacyNumber?: string | null;
};

export function IntakeForm({
  brands,
  sizes,
  batchLabels,
  heading = "Przyjęcie towaru",
  suggestedLegacyNumber = null,
}: IntakeFormProps) {
  const [state, formAction] = useActionState(createItem, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmDuplicateRef = useRef<HTMLInputElement>(null);
  const [condition, setCondition] = useState("");
  // Was a separate "Przyjęcie (magazyn)" page/form before — merged into one,
  // since the only real difference was whether the old-number field showed.
  const [isLegacyItem, setIsLegacyItem] = useState(false);
  const [legacyNumber, setLegacyNumber] = useState("");
  // Starts from the server-computed guess (based on the last 10 old numbers
  // typed in); bumped by one locally after each save so a whole batch of
  // sequential items can be entered without retyping the number pattern
  // every time or waiting on a fresh page load.
  const [nextSuggestion, setNextSuggestion] = useState(suggestedLegacyNumber);

  function handleLegacyToggle(checked: boolean) {
    setIsLegacyItem(checked);
    if (checked && !legacyNumber && nextSuggestion) {
      setLegacyNumber(nextSuggestion);
    }
  }

  function handleAddAnyway() {
    if (confirmDuplicateRef.current) confirmDuplicateRef.current.value = "true";
    formRef.current?.requestSubmit();
  }

  useEffect(() => {
    // Resets the form ref and local `condition`/`isLegacyItem`/`legacyNumber`
    // state after a successful submission. Kept as an effect (rather than
    // the render-time previous-state pattern) because it touches
    // formRef.current, and refs must not be read or written during render.
    if (state.status === "success") {
      formRef.current?.reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCondition("");
      setIsLegacyItem(false);
      const parsed = parseShoeId(legacyNumber);
      if (parsed) {
        setNextSuggestion(`${parsed.prefix}${parsed.internalNumber + 1}`);
      }
      setLegacyNumber("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-[var(--space-lg)] px-6 py-12">
        <h1 className={headingClass}>{heading}</h1>

      <form ref={formRef} action={formAction} className="flex flex-col gap-5">
        <input
          ref={confirmDuplicateRef}
          type="hidden"
          name="confirmDuplicate"
          defaultValue="false"
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="brand" className={labelClass}>
            Marka
          </label>
          <input
            id="brand"
            name="brand"
            type="text"
            list="brand-options"
            autoComplete="off"
            required
            className={inputClass}
          />
          <datalist id="brand-options">
            {brands.map((brand) => (
              <option key={brand} value={brand} />
            ))}
          </datalist>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="size" className={labelClass}>
            Rozmiar
          </label>
          <input
            id="size"
            name="size"
            type="text"
            list="size-options"
            autoComplete="off"
            required
            className={inputClass}
          />
          <datalist id="size-options">
            {sizes.map((size) => (
              <option key={size} value={size} />
            ))}
          </datalist>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="insoleLength" className={labelClass}>
            Długość wkładki
          </label>
          <input
            id="insoleLength"
            name="insoleLength"
            type="text"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="batchLabel" className={labelClass}>
            Partia
          </label>
          <input
            id="batchLabel"
            name="batchLabel"
            type="text"
            list="batch-options"
            autoComplete="off"
            className={inputClass}
          />
          <datalist id="batch-options">
            {batchLabels.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            checked={isLegacyItem}
            onChange={(e) => handleLegacyToggle(e.target.checked)}
            className={checkboxClass}
          />
          To stary towar (ma stary numer z poprzedniego systemu)
        </label>

        {isLegacyItem && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="legacyNumber" className={labelClass}>
              Stary numer
            </label>
            <input
              id="legacyNumber"
              name="legacyNumber"
              type="text"
              value={legacyNumber}
              onChange={(e) => setLegacyNumber(e.target.value)}
              className={inputClass}
            />
            {nextSuggestion && (
              <p className={`text-xs ${mutedTextClass}`}>
                Podpowiedź na podstawie ostatnich numerów: {nextSuggestion}
                {legacyNumber !== nextSuggestion && (
                  <>
                    {" "}
                    ·{" "}
                    <button
                      type="button"
                      onClick={() => setLegacyNumber(nextSuggestion)}
                      className="underline hover:text-[var(--color-text)]"
                    >
                      użyj
                    </button>
                  </>
                )}
              </p>
            )}
          </div>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className={labelClass}>Stan butów</legend>
          {CONDITIONS.map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 text-sm text-[var(--color-text)]"
            >
              <input
                type="radio"
                name="condition"
                value={option}
                checked={condition === option}
                onChange={(e) => setCondition(e.target.value)}
                className={checkboxClass}
              />
              {option}
            </label>
          ))}
        </fieldset>

        {condition && CONDITION_DETAIL_OPTIONS[condition] && (
          <fieldset className="flex flex-col gap-2 pl-4">
            <legend className={labelClass}>
              Szczegół stanu (opcjonalnie)
            </legend>
            {CONDITION_DETAIL_OPTIONS[condition].map((detail) => (
              <label
                key={detail}
                className="flex items-center gap-2 text-sm text-[var(--color-text)]"
              >
                <input
                  type="radio"
                  name="conditionDetail"
                  value={detail}
                  className={checkboxClass}
                />
                {detail}
              </label>
            ))}
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className={labelClass}>Wady</legend>
          {DEFECTS.map((defect) => (
            <label
              key={defect}
              className="flex items-center gap-2 text-sm text-[var(--color-text)]"
            >
              <input
                type="checkbox"
                name="defects"
                value={defect}
                className={checkboxClass}
              />
              {defect}
            </label>
          ))}
          <input
            type="text"
            name="customDefect"
            placeholder="Inna wada (opcjonalnie)"
            className={inputClass}
          />
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="price" className={labelClass}>
            Cena
          </label>
          <input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="photos" className={labelClass}>
            Zdjęcia
          </label>
          <FileDropzone
            id="photos"
            name="photos"
            accept="image/*"
            multiple
            label="Kliknij lub przeciągnij zdjęcia tutaj"
          />
          <p className={`text-xs ${mutedTextClass}`}>
            Zdjęcia robocze — nie są publikowane w ogłoszeniu.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="note" className={labelClass}>
            Notatka
          </label>
          <textarea id="note" name="note" rows={3} className={inputClass} />
        </div>

        {state.status === "error" && (
          <p className={errorTextClass} role="alert">
            {state.error}
          </p>
        )}

        {state.status === "duplicate" && (
          <div className={noticeWarningClass}>
            <p>⚠️ {state.error}</p>
            <button
              type="button"
              onClick={handleAddAnyway}
              className="w-fit rounded-full bg-[var(--color-warning-bg)] px-4 py-2 text-sm font-medium text-[var(--color-warning)] transition-opacity hover:opacity-80"
            >
              Dodaj mimo to
            </button>
          </div>
        )}

        <SubmitButton />
      </form>

      {state.status === "success" && (
        <div className={`items-start ${noticeSuccessClass}`}>
          <div>
            <p className="font-medium">Towar przyjęty</p>
            <p>
              Numer wewnętrzny:{" "}
              <strong>
                {formatItemNumber(state.batchLabel, state.internalNumber ?? "")}
              </strong>
            </p>
          </div>
          <button
            type="button"
            onClick={() => printLabel(state)}
            className="rounded-full bg-[var(--color-success-bg)] px-4 py-2 text-sm font-medium text-[var(--color-success)] transition-opacity hover:opacity-80"
          >
            Drukuj etykietę
          </button>
        </div>
      )}
    </div>
    </div>
  );
}
