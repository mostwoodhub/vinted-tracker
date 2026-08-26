"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createSale,
  checkSoldNumber,
  checkItemsByLegacyNumber,
  type AddSaleState,
  type SoldNumberCheckResult,
  type ItemsByLegacyNumberResult,
} from "./actions";
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
  noticeWarningClass,
  pillClass,
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
//
// itemStatusByNumber (preloaded, instant) only knows about numbers that
// exist as a row in `items` — a legacy number with a recorded sale but no
// warehouse item (common for pre-migration stock) fell through to a
// generic "not in Magazynie" hint, with no sign it was already sold. The
// debounced checkSoldNumber lookup below covers that gap directly against
// `sales`, with a photo, and takes priority when it finds a match.
function ItemMatchHint({
  shoeId,
  itemStatusByNumber,
  onResolvedItemChange,
}: {
  shoeId: string;
  itemStatusByNumber: Record<string, string>;
  onResolvedItemChange?: (itemId: string | null) => void;
}) {
  const trimmed = shoeId.trim();
  const [soldCheck, setSoldCheck] = useState<SoldNumberCheckResult | null>(null);
  const [itemsCheck, setItemsCheck] = useState<ItemsByLegacyNumberResult | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);
  const latestRef = useRef(trimmed);
  useEffect(() => {
    latestRef.current = trimmed;
  });
  // Avoids re-running the lookup effect just because the parent passed a
  // fresh onResolvedItemChange closure — only `trimmed` should retrigger it.
  const onResolvedItemChangeRef = useRef(onResolvedItemChange);
  useEffect(() => {
    onResolvedItemChangeRef.current = onResolvedItemChange;
  });

  useEffect(() => {
    // Resetting zoom/selection/lookup state as the field changes, not
    // mirroring a prop into state — legitimate direct setState here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZoomedUrl(null);
    setSelectedItemId(null);
    onResolvedItemChangeRef.current?.(null);
    if (!trimmed) {
      setSoldCheck(null);
      setItemsCheck(null);
      return;
    }
    const timer = setTimeout(() => {
      Promise.all([checkSoldNumber(trimmed), checkItemsByLegacyNumber(trimmed)]).then(
        ([sold, items]) => {
          if (latestRef.current === trimmed) {
            setSoldCheck(sold);
            setItemsCheck(items);
          }
        }
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [trimmed]);

  if (!trimmed) return null;

  function selectCandidate(itemId: string) {
    setSelectedItemId(itemId);
    onResolvedItemChange?.(itemId);
  }

  if (itemsCheck?.ambiguous) {
    return (
      <>
        <div className={`${noticeWarningClass} flex-col gap-2`}>
          <p>
            ⚠️ Ten numer ma {itemsCheck.candidates.length} towary w Magazynie — wybierz,
            który sprzedano:
          </p>
          {itemsCheck.candidates.map((c) => (
            <div
              key={c.itemId}
              className={`flex flex-row items-center gap-3 rounded-[var(--radius-sm)] p-2 ${
                selectedItemId === c.itemId ? "ring-2 ring-[var(--color-accent)]" : ""
              }`}
            >
              {c.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.thumbUrl}
                  alt=""
                  onClick={() => setZoomedUrl(c.photoUrl)}
                  className="h-12 w-12 shrink-0 cursor-zoom-in rounded-[var(--radius-sm)] object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg)] text-xl">
                  📦
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate">{c.displayNumber}</p>
                <p className={`truncate text-xs ${mutedTextClass}`}>
                  {c.brand ?? "—"} {c.model ?? ""} · {ITEM_STATUS_LABELS[c.status] ?? c.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => selectCandidate(c.itemId)}
                className={`shrink-0 whitespace-nowrap rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium ${
                  selectedItemId === c.itemId
                    ? "bg-[var(--color-accent)] text-white"
                    : "underline hover:text-[var(--color-text)]"
                }`}
              >
                {selectedItemId === c.itemId ? "Wybrano ✓" : "Wybierz"}
              </button>
            </div>
          ))}
        </div>
        {zoomedUrl && (
          <div
            onClick={() => setZoomedUrl(null)}
            className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-6"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomedUrl}
              alt=""
              onClick={() => setZoomedUrl(null)}
              className="max-h-full max-w-full rounded-[var(--radius-md)] object-contain"
            />
          </div>
        )}
      </>
    );
  }

  if (soldCheck?.sold) {
    return (
      <>
        <div className={`${noticeWarningClass} flex-row items-center gap-3`}>
          {soldCheck.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={soldCheck.photoUrl}
              alt=""
              onClick={() => setZoomedUrl(soldCheck.photoUrl)}
              className="h-12 w-12 shrink-0 cursor-zoom-in rounded-[var(--radius-sm)] object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg)] text-xl">
              📦
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="truncate">
              ⚠️ Ten numer już sprzedany: <strong>{soldCheck.shoeId}</strong>
            </p>
            <p className={`truncate text-xs ${mutedTextClass}`}>
              {soldCheck.saleDate ?? "—"}
              {soldCheck.buyerName ? ` · ${soldCheck.buyerName}` : ""}
              {soldCheck.salePrice != null ? ` · ${formatPln(soldCheck.salePrice)}` : ""}
              {soldCheck.accountName ? ` · ${soldCheck.accountName}` : ""}
            </p>
          </div>
          <Link
            href={`/sales/${soldCheck.saleId}/edit`}
            target="_blank"
            className="shrink-0 whitespace-nowrap text-xs font-medium underline hover:text-[var(--color-text)]"
          >
            Zobacz →
          </Link>
        </div>
        {zoomedUrl && (
          <div
            onClick={() => setZoomedUrl(null)}
            className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-6"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomedUrl}
              alt=""
              onClick={() => setZoomedUrl(null)}
              className="max-h-full max-w-full rounded-[var(--radius-md)] object-contain"
            />
          </div>
        )}
      </>
    );
  }

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

type Pair = { shoeId: string; price: string; cost: string; resolvedItemId: string | null };
type LabelSlot =
  | { kind: "empty" }
  | { kind: "existing"; url: string; filename: string | null }
  | { kind: "new"; file: File; previewUrl: string };
const todayIso = () => new Date().toISOString().slice(0, 10);
const initialState: AddSaleState = { status: "idle" };
const emptyPair = (): Pair => ({ shoeId: "", price: "", cost: "", resolvedItemId: null });
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
          resolvedItemId: it.itemId ?? null,
        }))
      : [emptyPair()]
  );
  const [singleShoeId, setSingleShoeId] = useState(
    !isInitialMultiPair ? initialSale?.legacy_shoe_id ?? "" : ""
  );
  const [singleResolvedItemId, setSingleResolvedItemId] = useState<string | null>(
    !isInitialMultiPair ? initialItems?.[0]?.itemId ?? null : null
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
  const [vatMode, setVatMode] = useState(initialSale?.vat_mode ?? "full");
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

  function updatePair(index: number, field: "shoeId" | "price" | "cost", value: string) {
    setPairs((prev) =>
      prev.map((pair, i) => (i === index ? { ...pair, [field]: value } : pair))
    );
  }

  function updatePairResolvedItem(index: number, itemId: string | null) {
    setPairs((prev) =>
      prev.map((pair, i) => (i === index ? { ...pair, resolvedItemId: itemId } : pair))
    );
  }

  function handleCountryChange(value: string) {
    setCountry(value);
    if (vatMode === "zero") return;
    const fullRate = COUNTRY_VAT_RATE_MODE[value];
    if (fullRate != null) setVatRate(String(fullRate));
  }

  function handleVatModeChange(mode: string) {
    setVatMode(mode);
    setVatRate(mode === "zero" ? "0" : String(COUNTRY_VAT_RATE_MODE[country] ?? 23));
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
          itemId: p.resolvedItemId,
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
            <ItemMatchHint
              shoeId={singleShoeId}
              itemStatusByNumber={itemStatusByNumber}
              onResolvedItemChange={setSingleResolvedItemId}
            />
            <input type="hidden" name="resolvedItemId" value={singleResolvedItemId ?? ""} />
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
                  <ItemMatchHint
                    shoeId={pair.shoeId}
                    itemStatusByNumber={itemStatusByNumber}
                    onResolvedItemChange={(itemId) => updatePairResolvedItem(index, itemId)}
                  />
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

        <input type="hidden" name="vatRate" value={vatRate} />
        <input type="hidden" name="vatMode" value={vatMode} />
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClass}>VAT</span>
          <div className="flex gap-2">
            {VAT_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => handleVatModeChange(m.value)}
                className={`flex-1 ${pillClass(vatMode === m.value)}`}
              >
                {m.value === "zero"
                  ? "0%"
                  : `Pełny VAT (${COUNTRY_VAT_RATE_MODE[country] ?? 23}%)`}
              </button>
            ))}
          </div>
          <p className={`text-xs ${mutedTextClass}`}>
            Kwota VAT: {formatPln(calc.vatAmount)}
          </p>
        </div>

        <input
          type="checkbox"
          name="incomeTaxApplied"
          checked={incomeTaxApplied}
          onChange={() => {}}
          className="hidden"
        />
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClass}>Podatek dochodowy (3%)</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIncomeTaxApplied(true)}
              className={`flex-1 ${pillClass(incomeTaxApplied)}`}
            >
              Tak
            </button>
            <button
              type="button"
              onClick={() => setIncomeTaxApplied(false)}
              className={`flex-1 ${pillClass(!incomeTaxApplied)}`}
            >
              Nie
            </button>
          </div>
          <p className={`text-xs ${mutedTextClass}`}>
            Kwota podatku dochodowego: {formatPln(calc.incomeTaxAmount)}
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
