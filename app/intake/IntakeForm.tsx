"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { checkLegacyNumber, createItem, type IntakeState, type LegacyNumberCheckResult } from "./actions";
import { FileDropzone } from "@/app/FileDropzone";
import { IdleReminder } from "@/app/IdleReminder";
import { IntakeStatsSection, type IntakeItem } from "@/app/dashboard/IntakeStatsSection";
import { formatItemNumber } from "@/lib/item-number";
import { compressImages } from "@/lib/compress-image";
import { parseShoeId } from "@/lib/item-sale-match";
import { CONDITIONS, CONDITION_DETAIL_OPTIONS } from "@/lib/condition-options";
import {
  buttonPrimaryClass,
  cardSmClass,
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

const ITEM_STATUS_LABELS: Record<string, string> = {
  received: "Przyjęto",
  photos_uploaded: "Zdjęcia",
  ai_card_ready: "Karta AI",
  ready_to_publish: "Gotowe do publikacji",
  published: "Opublikowano",
  sold: "Sprzedano",
  returned: "Zwrot",
};

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

// Client-side mirror of lib/batches.ts's deriveBatchLabelFromLegacyNumber —
// that one is server-only (imports supabaseAdmin's neighbors), so it can't
// be imported directly into this client component. Kept as a tiny, stable
// pure function so both copies are trivial to keep in sync.
function deriveBatchLabelFromLegacyNumber(legacyNumber: string): string | null {
  const match = legacyNumber.trim().match(/^([A-Za-z]+)\d+$/);
  return match ? match[1] : null;
}

function SubmitButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending || disabled} className={buttonPrimaryClass}>
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
    formatItemNumber(state.batchLabel, state.internalNumber ?? "", state.legacyNumber)
  );

  printWindow.document.write(`<!doctype html>
<html>
  <head>
    <title>Etykieta ${displayNumber}</title>
    <style>
      /* Fizyczna etykieta na taśmie 40x20mm — nie mylić z etykietą
         wysyłkową (PDF) drukowaną przy sprzedaży, to zupełnie inny druk. */
      @page { size: 40mm 20mm; margin: 1mm; }
      * { box-sizing: border-box; }
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        width: 38mm;
        height: 18mm;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 0.5mm;
      }
      .number { font-size: 16px; font-weight: 700; line-height: 1.1; }
      .line {
        font-size: 8px;
        line-height: 1.2;
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
  todayCount?: number | null;
  ownItems?: IntakeItem[] | null;
  employeeId?: string | null;
  employeeName?: string | null;
  todayWarsaw?: string;
};

export function IntakeForm({
  brands,
  sizes,
  batchLabels,
  heading = "Przyjęcie towaru",
  suggestedLegacyNumber = null,
  todayCount = null,
  ownItems = null,
  employeeId = null,
  employeeName = null,
  todayWarsaw,
}: IntakeFormProps) {
  const [state, formAction] = useActionState(createItem, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmDuplicateRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const [compressingPhotos, setCompressingPhotos] = useState(false);
  const [condition, setCondition] = useState("");
  // Was a separate "Przyjęcie (magazyn)" page/form before — merged into
  // one, and later the old/new split within this form was dropped too:
  // every item just gets a letter-prefixed number now, one field, always.
  const [legacyNumber, setLegacyNumber] = useState("");
  // Auto-filled from legacyNumber's leading letters the moment enough of
  // the number is typed to derive one — only while still empty, so it
  // never overwrites a Partia the employee already typed by hand.
  const [batchLabel, setBatchLabel] = useState("");
  function handleLegacyNumberChange(value: string) {
    setLegacyNumber(value);
    const derived = deriveBatchLabelFromLegacyNumber(value);
    if (derived && !batchLabel) setBatchLabel(derived);
  }
  // Starts from the server-computed guess (based on the last 10 old numbers
  // typed in); bumped by one locally after each save so a whole batch of
  // sequential items can be entered without retyping the number pattern
  // every time or waiting on a fresh page load.
  const [nextSuggestion, setNextSuggestion] = useState(suggestedLegacyNumber);
  // Bumped locally right after each successful save, so the employee sees
  // their own count tick up immediately instead of only on next page load.
  const [count, setCount] = useState(todayCount);

  // As-you-type "does this number already exist" lookup, so the employee
  // can see (and look at a photo of) what's already under that number
  // before they even finish filling out the rest of the form — the
  // submit-time check in createItem still runs regardless, as the actual
  // safety net.
  const [dupCheck, setDupCheck] = useState<LegacyNumberCheckResult | null>(null);
  const [checkingDup, setCheckingDup] = useState(false);
  const [dupZoomed, setDupZoomed] = useState(false);
  const legacyNumberLatestRef = useRef(legacyNumber);
  useEffect(() => {
    legacyNumberLatestRef.current = legacyNumber;
  });

  useEffect(() => {
    // Resetting zoom/lookup state as the field changes, not mirroring a
    // prop into state — legitimate direct setState here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDupZoomed(false);
    const trimmed = legacyNumber.trim();
    if (!trimmed) {
      setDupCheck(null);
      setCheckingDup(false);
      return;
    }
    setCheckingDup(true);
    const timer = setTimeout(() => {
      checkLegacyNumber(trimmed).then((result) => {
        // Discard a response that's no longer for the current field value
        // (the user kept typing while this request was in flight).
        if (legacyNumberLatestRef.current.trim() === trimmed) {
          setDupCheck(result);
          setCheckingDup(false);
        }
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [legacyNumber]);

  function handleAddAnyway() {
    if (confirmDuplicateRef.current) confirmDuplicateRef.current.value = "true";
    formRef.current?.requestSubmit();
  }

  // Phone-camera photos (5-12MB each, no resizing anywhere else in the
  // pipeline) can push a multi-photo submission past the Server Action body
  // limit, which fails with a bare "Bad Request" before our own code even
  // runs. Downscaling here — replacing the input's FileList in place —
  // keeps every upload well under that limit regardless of the original.
  async function handlePhotosSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setCompressingPhotos(true);
    try {
      const compressed = await compressImages(files);
      const dt = new DataTransfer();
      compressed.forEach((f) => dt.items.add(f));
      if (photosInputRef.current) photosInputRef.current.files = dt.files;
    } finally {
      setCompressingPhotos(false);
    }
  }

  useEffect(() => {
    // Resets the form ref and local `condition`/`legacyNumber`/`batchLabel`
    // state after a successful submission. Kept as an effect (rather than
    // the render-time previous-state pattern) because it touches
    // formRef.current, and refs must not be read or written during render.
    if (state.status === "success") {
      formRef.current?.reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCondition("");
      setCount((c) => (c ?? 0) + 1);
      const parsed = parseShoeId(legacyNumber);
      if (parsed) {
        setNextSuggestion(`${parsed.prefix}${parsed.internalNumber + 1}`);
      }
      setLegacyNumber("");
      setBatchLabel("");
      setDupCheck(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className={pageWrapClass}>
      <IdleReminder />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-[var(--space-lg)] px-6 py-12">
        {count != null && (
          <div className={`${cardSmClass} flex items-center justify-between`}>
            <span className={`text-sm ${mutedTextClass}`}>Dzisiaj przyjąłeś</span>
            <span className="text-xl font-bold text-[var(--color-text)]">{count}</span>
          </div>
        )}
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
          <label htmlFor="legacyNumber" className={labelClass}>
            Numer (z literą)
          </label>
          <input
            id="legacyNumber"
            name="legacyNumber"
            type="text"
            value={legacyNumber}
            onChange={(e) => handleLegacyNumberChange(e.target.value)}
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
                    onClick={() => handleLegacyNumberChange(nextSuggestion)}
                    className="underline hover:text-[var(--color-text)]"
                  >
                    użyj
                  </button>
                </>
              )}
            </p>
          )}

          {checkingDup && (
            <p className={`text-xs ${mutedTextClass}`}>Sprawdzanie…</p>
          )}
          {!checkingDup && dupCheck?.exists && (
            <>
              <div className={`${noticeWarningClass} flex-row items-center gap-3`}>
                {dupCheck.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={dupCheck.thumbUrl}
                    alt=""
                    onClick={() => setDupZoomed(true)}
                    className="h-12 w-12 shrink-0 cursor-zoom-in rounded-[var(--radius-sm)] object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg)] text-xl">
                    📦
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate">
                    ⚠️ Ten numer już jest: <strong>{dupCheck.displayNumber}</strong>
                  </p>
                  <p className={`truncate text-xs ${mutedTextClass}`}>
                    {dupCheck.brand ?? "—"} {dupCheck.model ?? ""} ·{" "}
                    {ITEM_STATUS_LABELS[dupCheck.status] ?? dupCheck.status}
                  </p>
                </div>
                <Link
                  href={`/items/${dupCheck.itemId}`}
                  target="_blank"
                  className="shrink-0 whitespace-nowrap text-xs font-medium underline hover:text-[var(--color-text)]"
                >
                  Zobacz →
                </Link>
              </div>
              {dupZoomed && dupCheck.photoUrl && (
                <div
                  onClick={() => setDupZoomed(false)}
                  className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-6"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={dupCheck.photoUrl}
                    alt=""
                    onClick={() => setDupZoomed(false)}
                    className="max-h-full max-w-full rounded-[var(--radius-md)] object-contain"
                  />
                </div>
              )}
            </>
          )}
          {!checkingDup && dupCheck?.exists === false && legacyNumber.trim() && (
            <p className="text-xs text-[var(--color-success)]">✓ Numer wolny</p>
          )}
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
            value={batchLabel}
            onChange={(e) => setBatchLabel(e.target.value)}
            className={inputClass}
          />
          <datalist id="batch-options">
            {batchLabels.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
        </div>

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
            ref={photosInputRef}
            id="photos"
            name="photos"
            accept="image/*"
            multiple
            onChange={handlePhotosSelected}
            label={compressingPhotos ? "Kompresowanie zdjęć…" : "Kliknij lub przeciągnij zdjęcia tutaj"}
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

        <SubmitButton disabled={compressingPhotos} />
      </form>

      {state.status === "success" && (
        <div className={`items-start ${noticeSuccessClass}`}>
          <div>
            <p className="font-medium">Towar przyjęty</p>
            <p>
              Numer:{" "}
              <strong>
                {formatItemNumber(state.batchLabel, state.internalNumber ?? "", state.legacyNumber)}
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

      {employeeId && ownItems && todayWarsaw && (
        <IntakeStatsSection
          items={ownItems}
          displayNames={{ [employeeId]: employeeName ?? "Ty" }}
          todayWarsaw={todayWarsaw}
          heading="Twoje przyjęcia towaru"
          caveatText="Starsze towary (sprzed 16.08.2026) nie mają zapisanego, kto je przyjął."
          emptyStateText="Nie przyjąłeś jeszcze żadnego towaru w tym okresie."
          chartTitle="Chronologia Twoich przyjęć"
          chartSubtitle="Każda kropka to jeden dodany przez Ciebie towar, z dokładnym czasem."
        />
      )}
    </div>
    </div>
  );
}
