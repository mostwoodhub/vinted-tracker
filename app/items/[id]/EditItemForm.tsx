"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { updateItem, type EditItemState } from "./actions";
import { CONDITIONS, CONDITION_DETAIL_OPTIONS } from "@/lib/condition-options";
import {
  buttonPrimaryClass,
  cardClass,
  checkboxClass,
  errorTextClass,
  inputClass,
  successTextClass,
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

const initialState: EditItemState = { status: "idle" };

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonPrimaryClass}>
      {pending ? "Zapisywanie…" : "Zapisz zmiany"}
    </button>
  );
}

type EditItemFormProps = {
  itemId: string;
  brand: string | null;
  model: string | null;
  size: string | null;
  condition: string | null;
  conditionDetail: string | null;
  defects: string[];
  price: number | null;
  batchLabel: string | null;
};

export function EditItemForm({
  itemId,
  brand,
  model,
  size,
  condition: initialCondition,
  conditionDetail,
  defects,
  price,
  batchLabel,
}: EditItemFormProps) {
  const [state, formAction] = useActionState(updateItem, initialState);
  const [condition, setCondition] = useState(initialCondition ?? "");

  const extraDefects = defects.filter((defect) => !DEFECTS.includes(defect));
  const defectOptions = [...DEFECTS, ...extraDefects];

  return (
    <form
      action={formAction}
      className={`flex flex-col gap-4 ${cardClass}`}
    >
      <input type="hidden" name="itemId" value={itemId} />

      <h2 className="text-sm font-medium text-[var(--color-text)]">Edytuj towar</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text)]">Marka</span>
          <input
            name="brand"
            type="text"
            defaultValue={brand ?? ""}
            required
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text)]">Model</span>
          <input
            name="model"
            type="text"
            defaultValue={model ?? ""}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text)]">Rozmiar</span>
          <input
            name="size"
            type="text"
            defaultValue={size ?? ""}
            required
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text)]">Partia</span>
          <input
            name="batchLabel"
            type="text"
            defaultValue={batchLabel ?? ""}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text)]">Cena</span>
          <input
            name="price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={price ?? ""}
            className={inputClass}
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-[var(--color-text)]">Stan butów</legend>
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
          <legend className="text-sm font-medium text-[var(--color-text)]">
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
                defaultChecked={conditionDetail === detail}
                className={checkboxClass}
              />
              {detail}
            </label>
          ))}
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-[var(--color-text)]">Wady</legend>
        {defectOptions.map((defect) => (
          <label
            key={defect}
            className="flex items-center gap-2 text-sm text-[var(--color-text)]"
          >
            <input
              type="checkbox"
              name="defects"
              value={defect}
              defaultChecked={defects.includes(defect)}
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

      {state.status === "error" && (
        <p className={errorTextClass} role="alert">
          {state.error}
        </p>
      )}
      {state.status === "success" && (
        <p className={successTextClass}>
          Zapisano zmiany.
        </p>
      )}

      <div>
        <SaveButton />
      </div>
    </form>
  );
}
