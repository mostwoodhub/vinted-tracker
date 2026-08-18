"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { formatItemNumber } from "@/lib/item-number";
import {
  updateItemCostPrice,
  deleteItems,
  bulkUpdateStatus,
  bulkUpdatePrice,
  type UpdateCostState,
} from "./actions";
import { inputClass } from "@/lib/ui-classes";

export type WarehouseCardItem = {
  id: string;
  internal_number: number;
  legacy_number: string | null;
  brand: string | null;
  model: string | null;
  size: string | null;
  condition: string | null;
  condition_detail: string | null;
  price: number | null;
  cost_price: number | null;
  status: string;
  batches: { id: string; label: string | null } | null;
  photoUrl: string | null;
  daysInStatus?: number | null;
};

const READY_STATUSES = ["ready_to_publish", "published", "sold"];
const STALE_THRESHOLD_DAYS = 30;

const STATUS_ORDER = [
  "received",
  "photos_uploaded",
  "ai_card_ready",
  "ready_to_publish",
  "published",
  "returned",
  "sold",
];

const STATUS_META: Record<string, { label: string; badge: string }> = {
  received: {
    label: "Do zdjęć",
    badge: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
  },
  photos_uploaded: {
    label: "Zdjęcia",
    badge: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
  },
  ai_card_ready: {
    label: "Karta AI",
    badge: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
  },
  ready_to_publish: {
    label: "Gotowe do publikacji",
    badge: "bg-[var(--color-accent-bg)] text-[var(--color-accent-fg)]",
  },
  published: {
    label: "✓ Opublikowano",
    badge: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  },
  returned: {
    label: "Zwrot",
    badge: "bg-[var(--color-danger-bg)] text-[var(--color-danger)]",
  },
  sold: {
    label: "✓ Sprzedano",
    badge: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  },
};

const CONDITIONS = ["Nowe", "Bardzo dobry", "Dobry", "Zadowalający"];

// The number the business actually orders stock by — the manually-entered
// old/Stary numer, falling back to this app's own counter only for the rare
// item that never got one. Used to sort "Numeracja" newest-number-first,
// same direction as the "Dodania" (internal_number) sort so switching
// between them doesn't flip the whole list upside down.
function itemSortNumber(item: WarehouseCardItem): number {
  const legacy = item.legacy_number?.trim();
  if (legacy) {
    const match = legacy.match(/(\d+)/);
    if (match) return Number(match[1]);
  }
  return item.internal_number;
}

function pillClass(active: boolean) {
  return (
    "rounded-full px-4 py-2 text-sm font-medium transition-colors " +
    (active
      ? "bg-[var(--color-accent)] text-white"
      : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]")
  );
}

function statusMeta(status: string) {
  return (
    STATUS_META[status] ?? {
      label: status,
      badge: "bg-[var(--color-surface)] text-[var(--color-text-muted)]",
    }
  );
}

function exportCsv(items: WarehouseCardItem[]) {
  const headers = [
    "Nr",
    "Marka",
    "Model",
    "Rozmiar",
    "Stan",
    "Partia",
    "Cena",
    "Koszt",
    "Status",
  ];
  const rows = items.map((item) => [
    formatItemNumber(item.batches?.label, item.internal_number, item.legacy_number),
    item.brand ?? "",
    item.model ?? "",
    item.size ?? "",
    [item.condition, item.condition_detail].filter(Boolean).join(" "),
    item.batches?.label ?? "",
    item.price ?? "",
    item.cost_price ?? "",
    statusMeta(item.status).label,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `magazyn-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const costInitialState: UpdateCostState = { status: "idle" };

function CostEditor({
  itemId,
  costPrice,
}: {
  itemId: string;
  costPrice: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(
    updateItemCostPrice,
    costInitialState
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // Close the editor once when a save succeeds — computed during render
  // (comparing against the previous state) instead of in an effect, per
  // https://react.dev/learn/you-might-not-need-an-effect.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setEditing(false);
  }

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex w-fit items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        💾 {costPrice != null ? `koszt: ${costPrice} zł` : "brak kosztu"}
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="itemId" value={itemId} />
      <input
        ref={inputRef}
        name="costPrice"
        type="number"
        step="0.01"
        min="0"
        defaultValue={costPrice ?? ""}
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        className="w-20 rounded-[var(--radius-sm)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
      />
      {state.status === "error" && (
        <span className="text-xs text-[var(--color-danger)]">
          {state.error}
        </span>
      )}
    </form>
  );
}

function ItemDeleteButton({
  itemId,
  label,
}: {
  itemId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Na pewno usunąć towar ${label} z magazynu?`)) return;
    startTransition(async () => {
      try {
        await deleteItems([itemId]);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Nie udało się usunąć towaru");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title="Usuń towar"
      className="shrink-0 rounded-[var(--radius-sm)] p-2 text-[var(--color-danger)] transition-opacity hover:opacity-70 disabled:opacity-40"
    >
      {pending ? "…" : "🗑️"}
    </button>
  );
}

function BulkActionsBar({
  count,
  onDelete,
  onCancel,
  onApplyStatus,
  onApplyPrice,
  deletePending,
  statusPending,
  pricePending,
}: {
  count: number;
  onDelete: () => void;
  onCancel: () => void;
  onApplyStatus: (status: string) => void;
  onApplyPrice: (price: string) => void;
  deletePending: boolean;
  statusPending: boolean;
  pricePending: boolean;
}) {
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkPrice, setBulkPrice] = useState("");
  const anyPending = deletePending || statusPending || pricePending;

  return (
    <div className="sticky top-2 z-10 flex flex-col gap-3 rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--color-danger)]">
          Zaznaczono: {count}
        </p>
        <button
          type="button"
          onClick={onCancel}
          disabled={anyPending}
          className="rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          Anuluj zaznaczenie
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={bulkStatus}
          onChange={(e) => setBulkStatus(e.target.value)}
          className={`${inputClass} w-auto text-sm`}
        >
          <option value="" disabled>
            Zmień status na…
          </option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {statusMeta(s).label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!bulkStatus || anyPending}
          onClick={() => onApplyStatus(bulkStatus)}
          className="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {statusPending ? "Zmieniam…" : "Zastosuj status"}
        </button>

        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Nowa cena"
          value={bulkPrice}
          onChange={(e) => setBulkPrice(e.target.value)}
          className={`${inputClass} w-28 text-sm`}
        />
        <button
          type="button"
          disabled={!bulkPrice || anyPending}
          onClick={() => onApplyPrice(bulkPrice)}
          className="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pricePending ? "Zmieniam…" : "Zastosuj cenę"}
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={anyPending}
          className="ml-auto rounded-[var(--radius-sm)] bg-[var(--color-danger-solid,var(--color-danger))] px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {deletePending ? "Usuwanie…" : `🗑️ Usuń zaznaczone (${count})`}
        </button>
      </div>
    </div>
  );
}

export function WarehouseCards({
  items,
  defaultStatusFilter = "ready",
  isAdmin = false,
}: {
  items: WarehouseCardItem[];
  defaultStatusFilter?: string;
  isAdmin?: boolean;
}) {
  const brands = useMemo(
    () =>
      Array.from(
        new Set(items.map((item) => item.brand).filter((v): v is string => !!v))
      ).sort(),
    [items]
  );
  const sizes = useMemo(
    () =>
      Array.from(
        new Set(items.map((item) => item.size).filter((v): v is string => !!v))
      ).sort(),
    [items]
  );
  const batchLabels = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .map((item) => item.batches?.label)
            .filter((v): v is string => !!v)
        )
      ).sort(),
    [items]
  );

  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState(defaultStatusFilter);
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [batch, setBatch] = useState("");
  const [condition, setCondition] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"numeracja" | "dodania">("numeracja");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();
  const [statusPending, startStatusTransition] = useTransition();
  const [pricePending, startPriceTransition] = useTransition();

  const toggleItemSelected = (itemId: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  function handleBulkDelete() {
    const count = selectedItems.size;
    if (count === 0) return;
    if (!confirm(`Na pewno usunąć ${count} towar(ów) z magazynu?`)) return;
    startDeleteTransition(async () => {
      try {
        await deleteItems(Array.from(selectedItems));
        setSelectedItems(new Set());
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Nie udało się usunąć towarów");
      }
    });
  }

  function handleBulkStatus(status: string) {
    const count = selectedItems.size;
    if (count === 0 || !status) return;
    if (!confirm(`Zmienić status ${count} towar(ów) na „${statusMeta(status).label}”?`))
      return;
    startStatusTransition(async () => {
      try {
        await bulkUpdateStatus(Array.from(selectedItems), status);
        setSelectedItems(new Set());
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Nie udało się zmienić statusu");
      }
    });
  }

  function handleBulkPrice(priceRaw: string) {
    const count = selectedItems.size;
    const price = Number(priceRaw.replace(",", "."));
    if (count === 0 || !priceRaw || Number.isNaN(price)) return;
    if (!confirm(`Ustawić cenę ${price} zł dla ${count} towar(ów)?`)) return;
    startPriceTransition(async () => {
      try {
        await bulkUpdatePrice(Array.from(selectedItems), price);
        setSelectedItems(new Set());
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Nie udało się zmienić ceny");
      }
    });
  }

  const filtered = useMemo(() => {
    const min = minPrice ? Number(minPrice) : null;
    const max = maxPrice ? Number(maxPrice) : null;
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      if (statusFilter === "ready") {
        if (!READY_STATUSES.includes(item.status)) return false;
      } else if (statusFilter && item.status !== statusFilter) {
        return false;
      }
      if (brand && item.brand !== brand) return false;
      if (size && item.size !== size) return false;
      if (batch && item.batches?.label !== batch) return false;
      if (condition && item.condition !== condition) return false;
      if (min !== null && (item.price == null || item.price < min))
        return false;
      if (max !== null && (item.price == null || item.price > max))
        return false;
      if (query) {
        const number = formatItemNumber(
          item.batches?.label,
          item.internal_number,
          item.legacy_number
        ).toLowerCase();
        const haystack = `${number} ${item.brand ?? ""} ${item.model ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [
    items,
    statusFilter,
    brand,
    size,
    batch,
    condition,
    minPrice,
    maxPrice,
    search,
  ]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortBy === "numeracja") {
      arr.sort((a, b) => itemSortNumber(b) - itemSortNumber(a));
    } else {
      arr.sort((a, b) => b.internal_number - a.internal_number);
    }
    return arr;
  }, [filtered, sortBy]);

  const summary = useMemo(() => {
    const sold = filtered.filter((item) => item.status === "sold").length;
    const published = filtered.filter(
      (item) => item.status === "published"
    ).length;
    const processing = filtered.filter((item) =>
      [
        "received",
        "photos_uploaded",
        "ai_card_ready",
        "ready_to_publish",
      ].includes(item.status)
    ).length;
    const inStock = filtered.filter((item) => item.status !== "sold").length;

    return { inStock, processing, published, sold };
  }, [filtered]);

  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter("ready")}
          className={pillClass(statusFilter === "ready")}
        >
          Gotowe / opublikowane
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("")}
          className={pillClass(statusFilter === "")}
        >
          Wszystkie
        </button>
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={pillClass(statusFilter === s)}
          >
            {statusMeta(s).label}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-[var(--color-text-muted)]">Szukaj</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Numer, marka, model…"
          className={`${inputClass} max-w-sm`}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-[var(--color-text-muted)]">Sortuj</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSortBy("numeracja")}
            className={pillClass(sortBy === "numeracja")}
          >
            Numeracja
          </button>
          <button
            type="button"
            onClick={() => setSortBy("dodania")}
            className={pillClass(sortBy === "dodania")}
          >
            Data dodania
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-[var(--gap-default)]">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--color-text-muted)]">Marka</span>
          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className={inputClass}
          >
            <option value="">Wszystkie</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--color-text-muted)]">Rozmiar</span>
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className={inputClass}
          >
            <option value="">Wszystkie</option>
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--color-text-muted)]">Partia</span>
          <select
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            className={inputClass}
          >
            <option value="">Wszystkie</option>
            {batchLabels.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--color-text-muted)]">Stan</span>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className={inputClass}
          >
            <option value="">Wszystkie</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--color-text-muted)]">Cena od</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className={`${inputClass} w-28`}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--color-text-muted)]">Cena do</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className={`${inputClass} w-28`}
          />
        </label>

        <button
          type="button"
          onClick={() => exportCsv(filtered)}
          className="ml-auto flex h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-success-solid)] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          📤 Eksportuj CSV
        </button>
      </div>

      <div className="grid grid-cols-2 gap-[var(--space-md)] sm:grid-cols-4">
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-[var(--card-padding)]">
          <p className="text-xs text-[var(--color-text-muted)]">
            📦 W magazynie
          </p>
          <p className="mt-1 text-3xl font-bold text-[var(--color-text)]">
            {summary.inStock}
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-[var(--card-padding)]">
          <p className="text-xs text-[var(--color-text-muted)]">
            ⏳ W trakcie obróbki
          </p>
          <p className="mt-1 text-3xl font-bold text-[var(--color-text)]">
            {summary.processing}
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-[var(--card-padding)]">
          <p className="text-xs text-[var(--color-text-muted)]">
            📤 Opublikowano
          </p>
          <p className="mt-1 text-3xl font-bold text-[var(--color-success)]">
            {summary.published}
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-[var(--card-padding)]">
          <p className="text-xs text-[var(--color-text-muted)]">
            ✓ Sprzedano
          </p>
          <p className="mt-1 text-3xl font-bold text-[var(--color-success)]">
            {summary.sold}
          </p>
        </div>
      </div>

      {isAdmin && selectedItems.size > 0 && (
        <BulkActionsBar
          count={selectedItems.size}
          onDelete={handleBulkDelete}
          onCancel={() => setSelectedItems(new Set())}
          onApplyStatus={handleBulkStatus}
          onApplyPrice={handleBulkPrice}
          deletePending={deletePending}
          statusPending={statusPending}
          pricePending={pricePending}
        />
      )}

      <div className="flex flex-col gap-[var(--gap-default)]">
        {sorted.map((item) => {
          const meta = statusMeta(item.status);
          return (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-[var(--card-padding)] sm:flex-row sm:items-center sm:gap-[var(--space-md)]"
            >
              <div className="flex items-start gap-[var(--space-md)]">
                {isAdmin && (
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.id)}
                    onChange={() => toggleItemSelected(item.id)}
                    className="mt-1 h-4 w-4 shrink-0 sm:mt-0"
                    aria-label={`Zaznacz ${formatItemNumber(item.batches?.label, item.internal_number, item.legacy_number)}`}
                  />
                )}

                {item.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.photoUrl}
                    alt=""
                    onClick={() => setZoomedUrl(item.photoUrl)}
                    className="h-16 w-16 shrink-0 cursor-zoom-in rounded-[var(--radius-sm)] object-cover transition-opacity hover:opacity-80"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg)] text-2xl">
                    📦
                  </div>
                )}

                <div className="flex min-w-0 flex-1 flex-col gap-1 sm:hidden">
                  <Link
                    href={`/items/${item.id}`}
                    className="line-clamp-2 font-bold text-[var(--color-text)] hover:text-[var(--color-accent-fg)]"
                  >
                    ✏️ {formatItemNumber(item.batches?.label, item.internal_number, item.legacy_number)}{" "}
                    · {item.brand ?? "—"} {item.model ?? ""}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}
                    >
                      {meta.label}
                    </span>
                    {item.daysInStatus != null &&
                      item.daysInStatus >= STALE_THRESHOLD_DAYS && (
                        <span
                          title="Towar długo bez zmiany statusu"
                          className="rounded-full bg-[var(--color-danger-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-danger)]"
                        >
                          ⏳ {item.daysInStatus} dni bez ruchu
                        </span>
                      )}
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="hidden flex-wrap items-center gap-2 sm:flex">
                  <Link
                    href={`/items/${item.id}`}
                    className="font-bold text-[var(--color-text)] hover:text-[var(--color-accent-fg)]"
                  >
                    ✏️ {formatItemNumber(item.batches?.label, item.internal_number, item.legacy_number)}{" "}
                    · {item.brand ?? "—"} {item.model ?? ""}
                  </Link>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}
                  >
                    {meta.label}
                  </span>
                  {item.daysInStatus != null &&
                    item.daysInStatus >= STALE_THRESHOLD_DAYS && (
                      <span
                        title="Towar długo bez zmiany statusu"
                        className="rounded-full bg-[var(--color-danger-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-danger)]"
                      >
                        ⏳ {item.daysInStatus} dni bez ruchu
                      </span>
                    )}
                </div>
                <p className="truncate text-sm text-[var(--color-text-muted)]">
                  Rozmiar {item.size ?? "—"} · {item.condition ?? "—"}
                  {item.condition_detail ? ` (${item.condition_detail})` : ""}
                  {item.batches?.label && (
                    <>
                      {" "}
                      ·{" "}
                      <Link
                        href={`/batches/${item.batches.id}`}
                        className="hover:text-[var(--color-text)]"
                      >
                        📦 {item.batches.label}
                      </Link>
                    </>
                  )}
                </p>
                <CostEditor itemId={item.id} costPrice={item.cost_price} />
              </div>

              <div className="flex items-center justify-between gap-3 sm:shrink-0 sm:flex-col sm:items-end sm:justify-start sm:gap-1">
                <p
                  className={`text-2xl font-bold ${
                    item.price != null
                      ? "text-[var(--color-success)]"
                      : "text-[var(--color-text-muted)]"
                  }`}
                >
                  {item.price != null ? `${item.price} zł` : "—"}
                </p>

                {isAdmin && (
                  <ItemDeleteButton
                    itemId={item.id}
                    label={formatItemNumber(item.batches?.label, item.internal_number, item.legacy_number)}
                  />
                )}
              </div>
            </div>
          );
        })}

        {sorted.length === 0 && (
          <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-8 text-center text-sm text-[var(--color-text-muted)]">
            Brak towarów spełniających kryteria.
          </div>
        )}
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
