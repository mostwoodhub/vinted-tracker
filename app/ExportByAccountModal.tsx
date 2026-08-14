"use client";

import { useMemo, useState } from "react";
import type { SaleRow } from "@/lib/sales-types";
import {
  defaultPeriodFilter,
  matchesPeriod,
  type PeriodFilterState,
} from "@/lib/period-filter";
import { exportSalesByAccounts, type AccountExportFormat } from "@/lib/sales-export";
import { PeriodFilterControl } from "@/app/PeriodFilterControl";
import {
  buttonSecondaryClass,
  buttonSuccessClass,
  cardClass,
  checkboxClass,
  mutedTextClass,
  pillClass,
} from "@/lib/ui-classes";

export function ExportByAccountModal({
  sales,
  accountNames,
  onClose,
  initialPeriod,
}: {
  sales: SaleRow[];
  accountNames?: string[];
  onClose: () => void;
  initialPeriod?: PeriodFilterState;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<AccountExportFormat>("tabs");
  const [period, setPeriod] = useState<PeriodFilterState>(initialPeriod ?? defaultPeriodFilter());
  const [exporting, setExporting] = useState(false);

  // The account list is the master list from Konta (sales_accounts_archive),
  // not just whatever shows up in the currently loaded sales — otherwise an
  // account with no sales yet (or one this batch of sales happens not to
  // include) silently disappears from the picker. Any account_name that
  // only exists on a sale (legacy data not in the master list) is still
  // included so nothing becomes unexportable.
  const accounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sale of sales) {
      const key = sale.account_name || "—";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const names = new Set<string>([...(accountNames ?? []), ...counts.keys()]);
    return Array.from(names)
      .map((name) => [name, counts.get(name) ?? 0] as const)
      .sort(([a], [b]) => a.localeCompare(b));
  }, [sales, accountNames]);

  function toggle(account: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(account)) next.delete(account);
      else next.add(account);
      return next;
    });
  }

  async function handleExport() {
    if (selected.size === 0) return;
    setExporting(true);
    try {
      const scoped = sales.filter((s) => matchesPeriod(s.sale_date, period));
      await exportSalesByAccounts(scoped, Array.from(selected), format);
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nie udało się wygenerować pliku");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-hidden ${cardClass}`}>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Wybierz konta</h2>
          <p className={`text-sm ${mutedTextClass}`}>
            Eksport: Data, Nazwa, Kraj, Cena sprzedaży
          </p>
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto">
          {accounts.map(([account, count]) => (
            <label
              key={account}
              className="flex items-center gap-3 rounded-[var(--radius-sm)] bg-[var(--color-bg)] px-3 py-2.5"
            >
              <input
                type="checkbox"
                checked={selected.has(account)}
                onChange={() => toggle(account)}
                className={checkboxClass}
              />
              <span className="flex-1 text-sm font-medium text-[var(--color-text)]">
                {account}
              </span>
              <span className={`text-sm ${mutedTextClass}`}>({count})</span>
            </label>
          ))}
          {accounts.length === 0 && (
            <p className={`text-sm ${mutedTextClass}`}>Brak sprzedaży.</p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-4">
          <span className={`text-xs ${mutedTextClass}`}>Format eksportu</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFormat("tabs")}
              className={pillClass(format === "tabs")}
            >
              📁 Osobne zakładki
            </button>
            <button
              type="button"
              onClick={() => setFormat("single")}
              className={pillClass(format === "single")}
            >
              📋 Jedna lista
            </button>
          </div>
          <p className={`text-xs ${mutedTextClass}`}>
            {format === "tabs"
              ? 'Każde konto na osobnej zakładce + zakładka "Razem" (jeśli wybrano więcej niż 1 konto).'
              : "Wszystkie zaznaczone konta na jednej liście, z kolumną Konto."}
          </p>
        </div>

        <PeriodFilterControl value={period} onChange={setPeriod} />

        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-4">
          <button type="button" onClick={onClose} className={buttonSecondaryClass}>
            Anuluj
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || exporting}
            onClick={handleExport}
            className={buttonSuccessClass}
          >
            {exporting ? "Generowanie…" : "📤 Eksportuj"}
          </button>
        </div>
      </div>
    </div>
  );
}
