"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createSale, type AddSaleState } from "./actions";
import { updateSale } from "@/app/sales/actions";
import {
  calcIncomeTaxAmount,
  calcNetProfit,
  calcVatAmount,
} from "@/lib/sales-calc";
import { COUNTRY_VAT_RATE_MODE, COUNTRIES } from "@/lib/country-vat-rates";
import { formatPln } from "@/lib/format";
import { FileDropzone } from "@/app/FileDropzone";
import { LabelCropModal } from "@/app/LabelCropModal";
import type { SaleRow } from "@/lib/sales-types";
import {
  buttonPrimaryClass,
  cardClass,
  checkboxClass,
  errorTextClass,
  inputClass,
  labelClass,
  mutedTextClass,
} from "@/lib/ui-classes";

const PLATFORMS = ["Vinted", "Allegro", "OLX"];
const VAT_MODES: { value: string; label: string }[] = [
  { value: "full", label: "Pełny" },
  { value: "zero", label: "Zerowy" },
];
const DEFAULT_COUNTRY = "Polska";
const DEFAULT_PLATFORM = "Vinted";

const ITEM_STATUS_LABELS: Record<string, string> = {
  received: "Przyjęto",
  photos_uploaded: "Zdjęcia",
  ai_card_ready: "Karta AI",
  ready_to_publish: "Gotowe do publikacji",
  published: "Opublikowano",
  sold: "Sprzedano",
  returned: "Zwrot",
};

// Live feedback under "Numer obuwia" — the field stays free text (plenty of
// sales are for things never run through Intake at all, e.g. personal items
// sold alongside stock), this just makes a mismatch visible instead of a
// silent no-op: see lib/item-sale-link.ts for why that matters for batch
// "Sprzedano X z N" counts.
function ItemMatchHint({
  shoeId,
  itemStatusByNumber,
}: {
  shoeId: string;
  itemStatusByNumber: Record<string, string>;
}) {
  const trimmed = shoeId.trim();
  if (!trimmed) return null;
  const status = itemStatusByNumber[trimmed];

  if (status === undefined) {
    return (
      <span className={`text-xs ${mutedTextClass}`}>
        — Brak takiego towaru w Magazynie (sprzedaż i tak się zapisze, ale nie
        wliczy się do statystyk partii)
      </span>
    );
  }
  if (status === "sold") {
    return (
      <span className="text-xs text-[var(--color-danger)]">
        ⚠ Ten towar jest już oznaczony jako sprzedany
      </span>
    );
  }
  return (
    <span className="text-xs text-[var(--color-success)]">
      ✓ Towar w Magazynie (status: {ITEM_STATUS_LABELS[status] ?? status})
    </span>
  );
}

type Pair = { shoeId: string; price: string; cost: string };
type LabelSlot =
  | { kind: "empty" }
  | { kind: "existing"; url: string; filename: string | null }
  | { kind: "new"; file: File; previewUrl: string };

const todayIso = () => new Date().toISOString().slice(0, 10);
const initialState: AddSaleState = { status: "idle" };
const emptyPair = (): Pair => ({ shoeId: "", price: "", cost: "" });
const toNumber = (v: string) => Number(v.replace(",", ".")) || 0;
const numToInput = (v: number | null | undefined) => (v == null ? "" : String(v));

export function AddSaleForm({
  accountNames,
  isAdmin,
  initialSale,
  itemStatusByNumber = {},
  itemBrandByNumber = {},
  brands = [],
}: {
  accountNames: string[];
  isAdmin: boolean;
  initialSale?: SaleRow;
  itemStatusByNumber?: Record<string, string>;
  itemBrandByNumber?: Record<string, string>;
  brands?: string[];
}) {
  const isEditing = Boolean(initialSale);
  const action = isEditing ? updateSale.bind(null, initialSale!.id) : createSale;
  const [state, formAction] = useActionState(action, initialState);

  const initialItems = initialSale?.items ?? null;
  const isInitialMultiPair = Array.isArray(initialItems) && initialItems.length > 1;

  const [platform, setPlatform] = useState(initialSale?.platform ?? DEFAULT_PLATFORM);
  const [quantity, setQuantity] = useState(
    isInitialMultiPair ? initialItems!.length : 1
  );
  const [pairs, setPairs] = useState<Pair[]>(
    isInitialMultiPair
      ? initialItems!.map((it) => ({
          shoeId: it.shoeId ?? "",
          price: numToInput(it.price),
          cost: numToInput(it.cost),
        }))
      : [emptyPair()]
  );
  const [singleShoeId, setSingleShoeId] = useState(
    !isInitialMultiPair ? initialSale?.legacy_shoe_id ?? "" : ""
  );
  const [singlePrice, setSinglePrice] = useState(
    !isInitialMultiPair ? numToInput(initialSale?.sale_price) : ""
  );
  const [singleCost, setSingleCost] = useState(
    !isInitialMultiPair ? numToInput(initialSale?.cost_price) : ""
  );
  const [brand, setBrand] = useState(initialSale?.brand ?? "");

  // Auto-fills brand the moment a typed shoe number matches a known
  // warehouse item — only while the field is still empty, so it never
  // overwrites something the employee already typed by hand.
  function handleSingleShoeIdChange(value: string) {
    setSingleShoeId(value);
    const match = itemBrandByNumber[value.trim()];
    if (match && !brand) setBrand(match);
  }

  const [existingPhotoUrls, setExistingPhotoUrls] = useState<string[]>(
    initialSale?.photo_urls ?? []
  );
  const [photos, setPhotos] = useState<File[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [labelSlot1, setLabelSlot1] = useState<LabelSlot>(
    initialSale?.label_url
      ? { kind: "existing", url: initialSale.label_url, filename: initialSale.label_filename }
      : { kind: "empty" }
  );
  const [labelSlot2, setLabelSlot2] = useState<LabelSlot>(
    initialSale?.label_url2
      ? { kind: "existing", url: initialSale.label_url2, filename: initialSale.label_filename2 }
      : { kind: "empty" }
  );
  const [pendingLabelSource, setPendingLabelSource] = useState<File | null>(null);
  const label1InputRef = useRef<HTMLInputElement>(null);
  const label2InputRef = useRef<HTMLInputElement>(null);

  // If the sale's current account was since renamed/deleted from the master
  // list, keep it selectable so editing the sale doesn't silently reassign
  // it to a different account just by opening the form.
  const accountOptions = useMemo(() => {
    const current = initialSale?.account_name;
    if (current && !accountNames.includes(current)) return [current, ...accountNames];
    return accountNames;
  }, [accountNames, initialSale?.account_name]);

  const [country, setCountry] = useState(initialSale?.country ?? DEFAULT_COUNTRY);
  const [vatRate, setVatRate] = useState(
    numToInput(initialSale?.vat_rate) || String(COUNTRY_VAT_RATE_MODE[DEFAULT_COUNTRY])
  );
  const [feeAmount, setFeeAmount] = useState(numToInput(initialSale?.fee_amount) || "0");
  const [incomeTaxApplied, setIncomeTaxApplied] = useState(
    initialSale?.income_tax_applied ?? true
  );

  const isMultiPair = quantity > 1;

  function handleQuantityChange(raw: string) {
    const n = Math.max(1, Math.round(Number(raw)) || 1);
    setQuantity(n);
    setPairs((prev) => {
      const next = [...prev];
      while (next.length < n) next.push(emptyPair());
      while (next.length > n) next.pop();
      return next;
    });
  }

  function updatePair(index: number, field: keyof Pair, value: string) {
    setPairs((prev) =>
      prev.map((pair, i) => (i === index ? { ...pair, [field]: value } : pair))
    );
  }

  function handleCountryChange(value: string) {
    setCountry(value);
    const mode = COUNTRY_VAT_RATE_MODE[value];
    if (mode != null) setVatRate(String(mode));
  }

  function syncPhotoInput(files: File[]) {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    if (photoInputRef.current) photoInputRef.current.files = dt.files;
  }

  function handlePhotosSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files ?? []);
    if (newFiles.length === 0) return;
    const combined = [...photos, ...newFiles];
    setPhotos(combined);
    // Resetting .value on a file input also clears its .files — so this
    // must happen BEFORE syncPhotoInput sets the real combined FileList,
    // not after. Doing it after was silently wiping out every photo just
    // added, so the form always submitted with none attached.
    e.target.value = "";
    syncPhotoInput(combined);
  }

  function removeNewPhoto(index: number) {
    const next = photos.filter((_, i) => i !== index);
    setPhotos(next);
    syncPhotoInput(next);
  }

  function removeExistingPhoto(index: number) {
    setExistingPhotoUrls((prev) => prev.filter((_, i) => i !== index));
  }

  const photoPreviewUrls = useMemo(
    () => photos.map((file) => URL.createObjectURL(file)),
    [photos]
  );
  useEffect(() => {
    return () => {
      photoPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photoPreviewUrls]);

  function syncLabelInputs(slot1: LabelSlot, slot2: LabelSlot) {
    const dt1 = new DataTransfer();
    if (slot1.kind === "new") dt1.items.add(slot1.file);
    if (label1InputRef.current) label1InputRef.current.files = dt1.files;

    const dt2 = new DataTransfer();
    if (slot2.kind === "new") dt2.items.add(slot2.file);
    if (label2InputRef.current) label2InputRef.current.files = dt2.files;
  }

  function handleLabelSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setPendingLabelSource(file);
  }

  function handleLabelCropDone(files: File[]) {
    let slot1 = labelSlot1;
    let slot2 = labelSlot2;
    for (const file of files) {
      const previewUrl = URL.createObjectURL(file);
      if (slot1.kind === "empty") {
        slot1 = { kind: "new", file, previewUrl };
      } else if (slot2.kind === "empty") {
        slot2 = { kind: "new", file, previewUrl };
      } else {
        break;
      }
    }
    setLabelSlot1(slot1);
    setLabelSlot2(slot2);
    syncLabelInputs(slot1, slot2);
    setPendingLabelSource(null);
  }

  function removeLabelSlot(which: 1 | 2) {
    if (which === 1) {
      if (labelSlot1.kind === "new") URL.revokeObjectURL(labelSlot1.previewUrl);
      setLabelSlot1({ kind: "empty" });
      syncLabelInputs({ kind: "empty" }, labelSlot2);
    } else {
      if (labelSlot2.kind === "new") URL.revokeObjectURL(labelSlot2.previewUrl);
      setLabelSlot2({ kind: "empty" });
      syncLabelInputs(labelSlot1, { kind: "empty" });
    }
  }

  const openLabelSlots =
    (labelSlot1.kind === "empty" ? 1 : 0) + (labelSlot2.kind === "empty" ? 1 : 0);

  const sumPrice = isMultiPair
    ? pairs.reduce((sum, p) => sum + toNumber(p.price), 0)
    : toNumber(singlePrice);
  const sumCost = isMultiPair
    ? pairs.reduce((sum, p) => sum + toNumber(p.cost), 0)
    : toNumber(singleCost);

  const calc = useMemo(() => {
    const fee = toNumber(feeAmount);
    const vat = toNumber(vatRate);
    const vatAmount = calcVatAmount(sumPrice, vat);
    const incomeTaxAmount = calcIncomeTaxAmount(sumPrice, incomeTaxApplied);
    const netProfit = calcNetProfit({
      salePrice: sumPrice,
      costPrice: sumCost,
      feeAmount: fee,
      vatAmount,
      incomeTaxAmount,
    });
    return { feeAmount: fee, vatAmount, incomeTaxAmount, netProfit };
  }, [sumPrice, sumCost, feeAmount, vatRate, incomeTaxApplied]);

  const itemsJson = useMemo(
    () =>
      JSON.stringify(
        pairs.map((p) => ({
          shoeId: p.shoeId,
          price: toNumber(p.price),
          cost: toNumber(p.cost),
        }))
      ),
    [pairs]
  );
  const combinedShoeIds = pairs.map((p) => p.shoeId.trim()).filter(Boolean).join(", ");

  function labelPreviewSrc(slot: LabelSlot): string | null {
    if (slot.kind === "existing") return slot.url;
    if (slot.kind === "new") return slot.previewUrl;
    return null;
  }

  return (
    <form action={formAction} className="flex flex-col gap-[var(--space-lg)]">
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${cardClass}`}>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Platforma</span>
          <select
            name="platform"
            required
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className={inputClass}
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Data</span>
          <input
            type="date"
            name="saleDate"
            required
            defaultValue={initialSale?.sale_date ?? todayIso()}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Imię kupującego</span>
          <input
            type="text"
            name="buyerName"
            defaultValue={initialSale?.buyer_name ?? ""}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Ilość par</span>
          <input
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => handleQuantityChange(e.target.value)}
            className={inputClass}
          />
          <input type="hidden" name="quantity" value={quantity} />
        </label>
      </div>

      {!isMultiPair && (
        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${cardClass}`}>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Numer obuwia (opcjonalnie)</span>
            <input
              type="text"
              name="legacyShoeId"
              value={singleShoeId}
              onChange={(e) => handleSingleShoeIdChange(e.target.value)}
              className={inputClass}
            />
            <ItemMatchHint shoeId={singleShoeId} itemStatusByNumber={itemStatusByNumber} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Marka</span>
            <input
              type="text"
              name="brand"
              list="sale-brand-options"
              autoComplete="off"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className={inputClass}
            />
            <datalist id="sale-brand-options">
              {brands.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Koszt</span>
            <input
              type="number"
              name="costPrice"
              step="0.01"
              min="0"
              value={singleCost}
              onChange={(e) => setSingleCost(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Cena</span>
            <input
              type="number"
              name="salePrice"
              step="0.01"
              min="0"
              required
              value={singlePrice}
              onChange={(e) => setSinglePrice(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      )}

      {isMultiPair && (
        <>
          <input type="hidden" name="salePrice" value={String(sumPrice)} />
          <input type="hidden" name="costPrice" value={String(sumCost)} />
          <input type="hidden" name="legacyShoeId" value={combinedShoeIds} />
          <input type="hidden" name="items" value={itemsJson} />

          <div className={`flex flex-col gap-4 ${cardClass}`}>
            <h2 className="text-sm font-medium text-[var(--color-text)]">
              Pozycje ({quantity} par)
            </h2>
            {pairs.map((pair, index) => (
              <div
                key={index}
                className="grid grid-cols-1 gap-3 rounded-[var(--radius-sm)] bg-[var(--color-bg)] p-3 sm:grid-cols-3"
              >
                <p className="text-xs font-medium text-[var(--color-text-muted)] sm:col-span-3">
                  Para {index + 1}
                </p>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Numer obuwia</span>
                  <input
                    type="text"
                    value={pair.shoeId}
                    onChange={(e) => updatePair(index, "shoeId", e.target.value)}
                    className={inputClass}
                  />
                  <ItemMatchHint shoeId={pair.shoeId} itemStatusByNumber={itemStatusByNumber} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Cena</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={pair.price}
                    onChange={(e) => updatePair(index, "price", e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Koszt</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={pair.cost}
                    onChange={(e) => updatePair(index, "cost", e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
              <span className={labelClass}>Suma ceny sprzedaży</span>
              <span className="text-lg font-bold text-[var(--color-text)]">
                {formatPln(sumPrice)}
              </span>
            </div>
          </div>
        </>
      )}

      <div className={`flex flex-col gap-3 ${cardClass}`}>
        <span className={labelClass}>Zdjęcia obuwia</span>
        <input type="hidden" name="existingPhotoUrls" value={JSON.stringify(existingPhotoUrls)} />
        {(existingPhotoUrls.length > 0 || photos.length > 0) && (
          <div className="flex flex-wrap gap-3">
            {existingPhotoUrls.map((url, index) => (
              <div key={`existing-${index}`} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="h-20 w-20 rounded-[var(--radius-sm)] object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeExistingPhoto(index)}
                  aria-label="Usuń zdjęcie"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-danger)] text-xs font-bold text-white"
                >
                  ✕
                </button>
              </div>
            ))}
            {photos.map((photo, index) => (
              <div key={`new-${index}`} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreviewUrls[index]}
                  alt=""
                  className="h-20 w-20 rounded-[var(--radius-sm)] object-cover"
                />
                <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-bold text-white">
                  +
                </span>
                <button
                  type="button"
                  onClick={() => removeNewPhoto(index)}
                  aria-label="Usuń zdjęcie"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-danger)] text-xs font-bold text-white"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <FileDropzone
          ref={photoInputRef}
          name="photos"
          accept="image/*"
          multiple
          onChange={handlePhotosSelected}
          label="Kliknij lub przeciągnij zdjęcia tutaj"
        />
        {isMultiPair && (existingPhotoUrls.length > 0 || photos.length > 0) && (
          <p className={`text-xs ${mutedTextClass}`}>
            Zdjęcia są dopasowane po kolejności do par powyżej (1 → Para 1, 2 → Para 2…).
          </p>
        )}
      </div>

      <div className={`flex flex-col gap-3 ${cardClass}`}>
        <span className={labelClass}>Etykieta wysyłkowa</span>
        <input ref={label1InputRef} type="file" name="label" className="hidden" />
        <input ref={label2InputRef} type="file" name="label2" className="hidden" />
        <input
          type="hidden"
          name="existingLabel1Url"
          value={labelSlot1.kind === "existing" ? labelSlot1.url : ""}
        />
        <input
          type="hidden"
          name="existingLabel1Filename"
          value={labelSlot1.kind === "existing" ? labelSlot1.filename ?? "" : ""}
        />
        <input
          type="hidden"
          name="existingLabel2Url"
          value={labelSlot2.kind === "existing" ? labelSlot2.url : ""}
        />
        <input
          type="hidden"
          name="existingLabel2Filename"
          value={labelSlot2.kind === "existing" ? labelSlot2.filename ?? "" : ""}
        />

        {(labelSlot1.kind !== "empty" || labelSlot2.kind !== "empty") && (
          <div className="flex flex-wrap gap-3">
            {[labelSlot1, labelSlot2].map((slot, i) => {
              const src = labelPreviewSrc(slot);
              if (!src) return null;
              return (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    className="h-20 w-20 rounded-[var(--radius-sm)] border border-[var(--color-border)] object-cover"
                  />
                  <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLabelSlot((i + 1) as 1 | 2)}
                    aria-label="Usuń etykietę"
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-danger)] text-xs font-bold text-white"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {openLabelSlots > 0 && (
          <FileDropzone
            accept="image/*,.pdf,application/pdf"
            onChange={handleLabelSelected}
            label={
              labelSlot1.kind === "empty" && labelSlot2.kind === "empty"
                ? "Kliknij lub przeciągnij plik etykiety (PDF/JPG/PNG)"
                : "Dodaj kolejny plik etykiety"
            }
          />
        )}
      </div>

      {pendingLabelSource && (
        <LabelCropModal
          file={pendingLabelSource}
          onCancel={() => setPendingLabelSource(null)}
          onDone={handleLabelCropDone}
        />
      )}

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${cardClass}`}>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Kraj</span>
          <select
            name="country"
            value={country}
            onChange={(e) => handleCountryChange(e.target.value)}
            className={inputClass}
          >
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Konto</span>
          <select
            name="accountName"
            defaultValue={initialSale?.account_name ?? ""}
            className={inputClass}
          >
            <option value="">— wybierz —</option>
            {accountOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClass}>Prowizja (zł)</span>
          <input
            type="number"
            name="feeAmount"
            step="0.01"
            min="0"
            value={feeAmount}
            onChange={(e) => setFeeAmount(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Stawka VAT %</span>
          <input
            type="number"
            name="vatRate"
            step="0.01"
            min="0"
            value={vatRate}
            onChange={(e) => setVatRate(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Tryb VAT</span>
          <select name="vatMode" defaultValue={initialSale?.vat_mode ?? "full"} className={inputClass}>
            {VAT_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Kwota VAT</span>
          <p className={`px-1 py-2.5 text-sm ${mutedTextClass}`}>
            {formatPln(calc.vatAmount)}
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            name="incomeTaxApplied"
            checked={incomeTaxApplied}
            onChange={(e) => setIncomeTaxApplied(e.target.checked)}
            className={checkboxClass}
          />
          Zastosuj podatek dochodowy (3%)
        </label>
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Kwota podatku dochodowego</span>
          <p className={`px-1 py-2.5 text-sm ${mutedTextClass}`}>
            {formatPln(calc.incomeTaxAmount)}
          </p>
        </div>

        {isAdmin ? (
          <label className="flex items-center gap-2 text-sm text-[var(--color-text)] sm:col-span-2">
            <input
              type="checkbox"
              name="confirmed"
              defaultChecked={initialSale ? initialSale.confirmed === true : true}
              className={checkboxClass}
            />
            Potwierdzone
          </label>
        ) : (
          <p className={`text-xs ${mutedTextClass} sm:col-span-2`}>
            Sprzedaż zostanie zapisana jako niezatwierdzona — czeka na zatwierdzenie przez administratora.
          </p>
        )}
      </div>

      <div className={cardClass}>
        <p className={`text-xs ${mutedTextClass}`}>Zysk netto (podgląd)</p>
        <p
          className={`mt-1 text-3xl font-bold ${
            calc.netProfit >= 0
              ? "text-[var(--color-success)]"
              : "text-[var(--color-danger)]"
          }`}
        >
          {formatPln(calc.netProfit)}
        </p>
      </div>

      {state.status === "error" && (
        <p className={errorTextClass} role="alert">
          {state.error}
        </p>
      )}

      <div>
        <SubmitButton isEditing={isEditing} />
      </div>
    </form>
  );
}

function SubmitButton({ isEditing }: { isEditing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonPrimaryClass}>
      {pending ? "Zapisywanie…" : isEditing ? "Zapisz zmiany" : "Dodaj sprzedaż"}
    </button>
  );
}
