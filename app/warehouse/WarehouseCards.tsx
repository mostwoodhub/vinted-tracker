"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { formatItemNumber } from "@/lib/item-number";
import { updateItemCostPrice, type UpdateCostState } from "./actions";
import { inputClass } from "@/lib/ui-classes";

export type WarehouseCardItem = {
  id: string;
  internal_number: number;
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
};

const READY_STATUSES = ["ready_to_publish", "published", "sold"];

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
    formatItemNumber(item.batches?.label, item.internal_number),
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

  useEffect(() => {
    if (state.status === "success") setEditing(false);
  }, [state]);

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

export function WarehouseCards({
  items,
  defaultStatusFilter = "ready",
}: {
  items: WarehouseCardItem[];
  defaultStatusFilter?: string;
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

  const [statusFilter, setStatusFilter] = useState(defaultStatusFilter);
  const [brand, setBrand] = useState("");
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState("");
  const [condition, setCondition] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const toggleSize = (size: string) => {
    setSelectedSizes((prev) => {
      const next = new Set(prev);
      if (next.has(size)) next.delete(size);
      else next.add(size);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const min = minPrice ? Number(minPrice) : null;
    const max = maxPrice ? Number(maxPrice) : null;

    return items.filter((item) => {
      if (statusFilter === "ready") {
        if (!READY_STATUSES.includes(item.status)) return false;
      } else if (statusFilter && item.status !== statusFilter) {
        return false;
      }
      if (brand && item.brand !== brand) return false;
      if (
        selectedSizes.size > 0 &&
        (!item.size || !selectedSizes.has(item.size))
      )
        return false;
      if (batch && item.batches?.label !== batch) return false;
      if (condition && item.condition !== condition) return false;
      if (min !== null && (item.price == null || item.price < min))
        return false;
      if (max !== null && (item.price == null || item.price > max))
        return false;
      return true;
    });
  }, [
    items,
    statusFilter,
    brand,
    selectedSizes,
    batch,
    condition,
    minPrice,
    maxPrice,
  ]);

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

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-[var(--color-text-muted)]">Rozmiar</span>
        <div className="flex flex-wrap gap-2">
          {sizes.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => toggleSize(size)}
              className={pillClass(selectedSizes.has(size))}
            >
              {size}
            </button>
          ))}
        </div>
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

      <div className="flex flex-col gap-[var(--gap-default)]">
        {filtered.map((item) => {
          const meta = statusMeta(item.status);
          return (
            <div
              key={item.id}
              className="flex items-center gap-[var(--space-md)] rounded-[var(--radius-md)] bg-[var(--color-surface)] p-[var(--card-padding)]"
            >
              {item.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.photoUrl}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-[var(--radius-sm)] object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg)] text-2xl">
                  📦
                </div>
              )}

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/items/${item.id}`}
                    className="font-bold text-[var(--color-text)] hover:text-[var(--color-accent-fg)]"
                  >
                    ✏️ {formatItemNumber(item.batches?.label, item.internal_number)}{" "}
                    · {item.brand ?? "—"} {item.model ?? ""}
                  </Link>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}
                  >
                    {meta.label}
                  </span>
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

              <div className="shrink-0 text-right">
                <p
                  className={`text-2xl font-bold ${
                    item.price != null
                      ? "text-[var(--color-success)]"
                      : "text-[var(--color-text-muted)]"
                  }`}
                >
                  {item.price != null ? `${item.price} zł` : "—"}
                </p>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-8 text-center text-sm text-[var(--color-text-muted)]">
            Brak towarów spełniających kryteria.
          </div>
        )}
      </div>
    </div>
  );
}
