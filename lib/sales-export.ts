"use client";

import type { SaleRow } from "@/lib/sales-types";

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportSalesByAccount(sales: SaleRow[]) {
  const byAccount = new Map<
    string,
    { count: number; revenue: number; cost: number; fee: number; vat: number; tax: number; profit: number }
  >();

  for (const sale of sales) {
    const key = sale.account_name || "—";
    const entry = byAccount.get(key) ?? {
      count: 0,
      revenue: 0,
      cost: 0,
      fee: 0,
      vat: 0,
      tax: 0,
      profit: 0,
    };
    entry.count += 1;
    entry.revenue += sale.sale_price ?? 0;
    entry.cost += sale.cost_price ?? 0;
    entry.fee += sale.fee_amount ?? 0;
    entry.vat += sale.vat_amount ?? 0;
    entry.tax += sale.income_tax_amount ?? 0;
    entry.profit += sale.net_profit ?? 0;
    byAccount.set(key, entry);
  }

  const headers = [
    "Konto",
    "Liczba sprzedaży",
    "Przychód",
    "Koszt własny",
    "Prowizje",
    "VAT",
    "Podatek dochodowy",
    "Zysk netto",
  ];
  const rows = Array.from(byAccount.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([account, e]) => [
      account,
      e.count,
      e.revenue.toFixed(2),
      e.cost.toFixed(2),
      e.fee.toFixed(2),
      e.vat.toFixed(2),
      e.tax.toFixed(2),
      e.profit.toFixed(2),
    ]);

  downloadCsv(
    `sprzedaz-wg-kont-${new Date().toISOString().slice(0, 10)}.csv`,
    headers,
    rows
  );
}
