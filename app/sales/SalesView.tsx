"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { PeriodFilterControl } from "@/app/PeriodFilterControl";
import { SalesActionBar } from "@/app/SalesActionBar";
import { defaultPeriodFilter, matchesPeriod, type PeriodFilterState } from "@/lib/period-filter";
import { formatPln } from "@/lib/format";
import { isMultiPairSale, isSaleIncomplete, type SaleRow } from "@/lib/sales-types";
import type { ProfileRow } from "@/lib/sales-stats";
import { deleteSale, setSaleConfirmed } from "./actions";
import {
  buttonPrimaryClass,
  cardClass,
  checkboxClass,
  headingClass,
  inputClass,
  mutedTextClass,
  pageWrapClass,
} from "@/lib/ui-classes";

const smallPillClass =
  "rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50";

export type ExpenseRow = {
  expense_date: string | null;
  category: string | null;
  amount: number | null;
  batch_name: string | null;
};

export type { ProfileRow };

function profitClass(value: number | null) {
  if (value == null || value === 0) return "text-[var(--color-text-muted)]";
  return value > 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]";
}

function ConfirmToggleButton({ saleId, confirmed }: { saleId: string; confirmed: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        await setSaleConfirmed(saleId, !confirmed);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Nie udało się zaktualizować statusu");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={
        confirmed
          ? "rounded-full bg-[var(--color-surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-opacity hover:opacity-80 disabled:opacity-50"
          : "rounded-full bg-[var(--color-success-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-success)] transition-opacity hover:opacity-80 disabled:opacity-50"
      }
    >
      {pending ? "…" : confirmed ? "Odznacz" : "Zatwierdź"}
    </button>
  );
}

function DeleteSaleButton({ saleId, label }: { saleId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Usunąć sprzedaż ${label}?`)) return;
    startTransition(async () => {
      try {
        await deleteSale(saleId);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Nie udało się usunąć sprzedaży");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={`${smallPillClass} bg-[var(--color-danger-bg)] text-[var(--color-danger)]`}
    >
      {pending ? "…" : "Usuń"}
    </button>
  );
}

function PhotoThumbs({
  urls,
  onZoom,
}: {
  urls: string[];
  onZoom: (url: string) => void;
}) {
  if (urls.length === 0) {
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg)] text-2xl">
        👟
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap gap-1.5">
      {urls.map((url, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={index}
          src={url}
          alt=""
          onClick={() => onZoom(url)}
          className="h-16 w-16 cursor-zoom-in rounded-[var(--radius-sm)] object-cover transition-opacity hover:opacity-80"
        />
      ))}
    </div>
  );
}

export function SalesView({
  sales,
  expenses,
  profiles,
  isAdmin,
  accountNames,
}: {
  sales: SaleRow[];
  expenses: ExpenseRow[];
  profiles: ProfileRow[];
  isAdmin: boolean;
  accountNames?: string[];
}) {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodFilterState>(defaultPeriodFilter());
  const [unconfirmedOnly, setUnconfirmedOnly] = useState(false);
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    // A number search means "find this specific sale anywhere" — the date
    // period filter shouldn't hide it just because it happened outside
    // today/this month. Only apply the period filter when not searching.
    return sales.filter((sale) => {
      if (!query && !matchesPeriod(sale.sale_date, period)) return false;
      if (unconfirmedOnly && sale.confirmed !== false) return false;
      if (query && !(sale.legacy_shoe_id ?? "").toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [sales, search, period, unconfirmedOnly]);

  const unconfirmedCount = useMemo(
    () => filtered.filter((sale) => sale.confirmed === false).length,
    [filtered]
  );

  const filteredExpenses = useMemo(
    () => expenses.filter((expense) => matchesPeriod(expense.expense_date, period)),
    [expenses, period]
  );

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-[var(--space-lg)] px-6 py-12">
        <div className="flex items-center justify-between gap-4">
          <h1 className={headingClass}>Sprzedaż</h1>
          <Link href="/sales/add" className={`no-print ${buttonPrimaryClass}`}>
            + Dodaj
          </Link>
        </div>

        <div className="no-print flex flex-col gap-[var(--space-md)]">
          <PeriodFilterControl value={period} onChange={setPeriod} />

          <div className="flex flex-wrap items-end gap-[var(--space-lg)]">
            <label className="flex max-w-xs flex-col gap-1.5">
              <span className={`text-xs ${mutedTextClass}`}>
                Szukaj po starym numerze
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="np. P15930"
                className={inputClass}
              />
              {search.trim() && (
                <span className={`text-xs ${mutedTextClass}`}>
                  Szukam we wszystkich datach, nie tylko w wybranym okresie.
                </span>
              )}
            </label>

            <label className="flex items-center gap-2 pb-2.5 text-sm text-[var(--color-text)]">
              <input
                type="checkbox"
                checked={unconfirmedOnly}
                onChange={(e) => setUnconfirmedOnly(e.target.checked)}
                className={checkboxClass}
              />
              Pokaż tylko niezatwierdzone
            </label>
          </div>
        </div>

        <SalesActionBar
          sales={filtered}
          allSales={sales}
          expenses={filteredExpenses}
          allBatchExpenses={expenses}
          profiles={profiles}
          period={period}
          accountNames={accountNames}
        />

        <div className="flex items-center gap-2">
          <p className={`text-sm ${mutedTextClass}`}>
            {filtered.length}{" "}
            {filtered.length === 1 ? "wynik" : "wyników"}
          </p>
          {unconfirmedCount > 0 && (
            <span className="rounded-full bg-[var(--color-warning-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-warning)]">
              {unconfirmedCount} niezatwierdzon{unconfirmedCount === 1 ? "a" : "ych"}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-[var(--gap-default)]">
          {filtered.map((sale) => {
            const multiPair = isMultiPairSale(sale);
            const incomplete = isSaleIncomplete(sale);
            const photoUrls =
              sale.photo_urls && sale.photo_urls.length > 0
                ? sale.photo_urls
                : sale.photo_url
                  ? [sale.photo_url]
                  : [];

            return (
              <div
                key={sale.id}
                className={`flex items-center gap-[var(--space-md)] ${cardClass}`}
              >
                <PhotoThumbs urls={photoUrls} onZoom={setZoomedUrl} />

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[var(--color-text)]">
                      {sale.legacy_shoe_id || "—"}
                    </span>
                    {sale.platform && (
                      <span className="rounded-full bg-[var(--color-accent-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-accent-fg)]">
                        {sale.platform}
                      </span>
                    )}
                    {multiPair && (
                      <span className="rounded-full bg-[var(--color-surface-2)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-text)]">
                        ×{sale.items!.length}
                      </span>
                    )}
                    {incomplete && (
                      <span className="rounded-full bg-[var(--color-warning-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-warning)]">
                        ⚠️ Wymaga uzupełnienia
                      </span>
                    )}
                  </div>
                  <p className={`truncate text-sm ${mutedTextClass}`}>
                    {sale.sale_date ?? "—"}
                    {sale.buyer_name ? ` · ${sale.buyer_name}` : ""}
                    {sale.account_name ? ` · ${sale.account_name}` : ""}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {isAdmin && (
                      <ConfirmToggleButton saleId={sale.id} confirmed={sale.confirmed === true} />
                    )}
                    {isAdmin && (
                      <>
                        <Link
                          href={`/sales/${sale.id}/edit`}
                          className={`${smallPillClass} bg-[var(--color-surface-2)] text-[var(--color-text)]`}
                        >
                          Edytuj
                        </Link>
                        <DeleteSaleButton saleId={sale.id} label={sale.legacy_shoe_id || sale.id} />
                      </>
                    )}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-xl font-bold text-[var(--color-text)]">
                    {formatPln(sale.sale_price)}
                  </p>
                  <p className={`text-sm font-medium ${profitClass(sale.net_profit)}`}>
                    {sale.net_profit != null && sale.net_profit > 0 ? "+" : ""}
                    {formatPln(sale.net_profit)}
                  </p>
                  {(sale.receipt_url || sale.label_url || sale.label_url2) && (
                    <div className="mt-1 flex justify-end gap-1.5">
                      {sale.receipt_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={sale.receipt_url}
                          alt=""
                          onClick={() => setZoomedUrl(sale.receipt_url)}
                          title="Zrzut ekranu sprzedaży"
                          className="h-7 w-7 cursor-zoom-in rounded-[var(--radius-sm)] object-cover transition-opacity hover:opacity-80"
                        />
                      )}
                      {sale.label_url && (
                        <a
                          href={sale.label_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full bg-[var(--color-accent-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-accent-fg)] transition-opacity hover:opacity-80"
                        >
                          🏷️ Etykieta
                        </a>
                      )}
                      {sale.label_url2 && (
                        <a
                          href={sale.label_url2}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full bg-[var(--color-accent-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-accent-fg)] transition-opacity hover:opacity-80"
                        >
                          🏷️ Etykieta 2
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className={`text-center text-sm ${mutedTextClass} ${cardClass}`}>
              Brak sprzedaży spełniających kryteria.
            </div>
          )}
        </div>
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
    </div>
  );
}
