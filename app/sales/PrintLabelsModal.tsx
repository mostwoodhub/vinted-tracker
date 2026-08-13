"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SaleRow } from "@/lib/sales-types";
import { defaultPeriodFilter, matchesPeriod, type PeriodFilterState } from "@/lib/period-filter";
import { openLabelPrintWindow } from "@/lib/label-print";
import { PeriodFilterControl } from "@/app/PeriodFilterControl";
import { LabelCropModal } from "@/app/LabelCropModal";
import { attachSaleLabel } from "./actions";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  buttonSuccessClass,
  cardClass,
  checkboxClass,
  mutedTextClass,
} from "@/lib/ui-classes";

export function PrintLabelsModal({
  sales,
  onClose,
}: {
  sales: SaleRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState<PeriodFilterState>(defaultPeriodFilter());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [attachTarget, setAttachTarget] = useState<{ saleId: string; file: File } | null>(null);
  const [attaching, setAttaching] = useState(false);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const attachSaleIdRef = useRef<string | null>(null);

  const visibleSales = useMemo(
    () => sales.filter((s) => matchesPeriod(s.sale_date, period)),
    [sales, period]
  );

  const allVisibleSelected =
    visibleSales.length > 0 && visibleSales.every((s) => selected.has(s.id));

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleSales.forEach((s) => next.delete(s.id));
      } else {
        visibleSales.forEach((s) => next.add(s.id));
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedSales = useMemo(
    () => sales.filter((s) => selected.has(s.id)),
    [sales, selected]
  );

  function handlePrintLabelsOnly() {
    openLabelPrintWindow(selectedSales, { includePhoto: false });
  }

  function handlePrintWithPhoto() {
    openLabelPrintWindow(selectedSales, { includePhoto: true });
  }

  function handleSaveBoth() {
    openLabelPrintWindow(selectedSales, { includePhoto: false });
    openLabelPrintWindow(selectedSales, { includePhoto: true });
  }

  function openAttachPicker(saleId: string) {
    attachSaleIdRef.current = saleId;
    attachInputRef.current?.click();
  }

  function handleAttachFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const saleId = attachSaleIdRef.current;
    if (file && saleId) setAttachTarget({ saleId, file });
  }

  async function handleAttachCropDone(files: File[]) {
    if (!attachTarget) return;
    setAttaching(true);
    try {
      for (const f of files) {
        await attachSaleLabel(attachTarget.saleId, f);
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nie udało się dodać pliku");
    } finally {
      setAttaching(false);
      setAttachTarget(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-hidden ${cardClass}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Drukuj etykiety</h2>
          <button type="button" onClick={onClose} className={buttonSecondaryClass}>
            Zamknij
          </button>
        </div>

        <PeriodFilterControl value={period} onChange={setPeriod} />

        <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleAllVisible}
            className={checkboxClass}
          />
          Zaznacz wszystkie widoczne ({visibleSales.length})
        </label>

        <div className="flex flex-col gap-2 overflow-y-auto">
          {visibleSales.map((sale) => (
            <div
              key={sale.id}
              className="flex items-center gap-3 rounded-[var(--radius-sm)] bg-[var(--color-bg)] px-3 py-2"
            >
              <input
                type="checkbox"
                checked={selected.has(sale.id)}
                onChange={() => toggleOne(sale.id)}
                className={checkboxClass}
              />
              {sale.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sale.photo_url}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-[var(--radius-sm)] object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] text-lg">
                  👟
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--color-text)]">
                  {sale.legacy_shoe_id || "—"}
                  {sale.buyer_name ? ` · ${sale.buyer_name}` : ""}
                </p>
                <p className={`truncate text-xs ${mutedTextClass}`}>{sale.sale_date ?? "—"}</p>
              </div>
              <button
                type="button"
                onClick={() => openAttachPicker(sale.id)}
                className="shrink-0 rounded-full bg-[var(--color-surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] transition-opacity hover:opacity-80"
              >
                📎 Dodaj plik
              </button>
            </div>
          ))}

          {visibleSales.length === 0 && (
            <p className={`text-sm ${mutedTextClass}`}>Brak sprzedaży w tym okresie.</p>
          )}
        </div>

        <input
          ref={attachInputRef}
          type="file"
          accept="image/*,.pdf,application/pdf"
          onChange={handleAttachFileSelected}
          className="hidden"
        />

        <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-4">
          <p className="text-sm font-medium text-[var(--color-text)]">
            Wybrano do druku: {selected.size}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={handlePrintLabelsOnly}
              className={buttonSuccessClass}
            >
              Tylko etykiety
            </button>
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={handlePrintWithPhoto}
              className="flex h-10 items-center justify-center rounded-full bg-[var(--color-accent)] px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Ze zdjęciem ({selected.size})
            </button>
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={handleSaveBoth}
              className={buttonPrimaryClass}
            >
              Zapisz oba pliki ({selected.size})
            </button>
          </div>
        </div>
      </div>

      {attachTarget && (
        <LabelCropModal
          file={attachTarget.file}
          onCancel={() => setAttachTarget(null)}
          onDone={handleAttachCropDone}
        />
      )}
      {attaching && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <p className={`rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-4 py-2 text-sm ${mutedTextClass}`}>
            Zapisywanie…
          </p>
        </div>
      )}
    </div>
  );
}
