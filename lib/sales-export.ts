"use client";

import type { SaleRow } from "@/lib/sales-types";
import type { PeriodFilterState } from "@/lib/period-filter";

export type AccountExportFormat = "tabs" | "single";

const EXPORT_COLUMNS = ["Data", "Nazwa", "Kraj", "Cena sprzedaży (zł)"] as const;

// "Nazwa" mirrors the old program: buyer name when we have it, otherwise
// fall back to the shoe number(s) so the row is still identifiable — a
// multi-pair sale lists every item, comma-separated.
function saleLabel(sale: SaleRow): string {
  if (sale.buyer_name) return sale.buyer_name;
  if (sale.items && sale.items.length > 0) {
    const ids = sale.items.map((item) => item.shoeId?.trim()).filter(Boolean);
    if (ids.length > 0) return ids.join(", ");
  }
  if (sale.legacy_shoe_id) return sale.legacy_shoe_id;
  return "—";
}

function sortByDate(sales: SaleRow[]): SaleRow[] {
  return [...sales].sort((a, b) => (a.sale_date ?? "").localeCompare(b.sale_date ?? ""));
}

// Excel sheet names: max 31 chars, and \ / ? * [ ] : are illegal.
function sheetSafeName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, "-").trim() || "Konto";
  return cleaned.slice(0, 31);
}

function uniqueSheetName(base: string, used: Set<string>): string {
  let name = sheetSafeName(base);
  let suffix = 2;
  while (used.has(name)) {
    const trimmed = sheetSafeName(base).slice(0, 28);
    name = `${trimmed} (${suffix})`;
    suffix += 1;
  }
  used.add(name);
  return name;
}

// Sheet's own account (single-account sheets) or every account (Razem/Sprzedaż).
function addAccountSheet(
  workbook: import("exceljs").Workbook,
  name: string,
  sales: SaleRow[],
  used: Set<string>,
  includeAccountColumn: boolean
) {
  const sheet = workbook.addWorksheet(uniqueSheetName(name, used));
  const headers = includeAccountColumn ? ["Konto", ...EXPORT_COLUMNS] : [...EXPORT_COLUMNS];
  sheet.addRow(headers);

  const sorted = sortByDate(sales);
  for (const sale of sorted) {
    const row = includeAccountColumn
      ? [sale.account_name || "—", sale.sale_date ?? "", saleLabel(sale), sale.country ?? "", sale.sale_price ?? 0]
      : [sale.sale_date ?? "", saleLabel(sale), sale.country ?? "", sale.sale_price ?? 0];
    sheet.addRow(row);
  }

  const priceCol = includeAccountColumn ? 5 : 4;
  const labelCol = priceCol - 1;
  const lastDataRow = sorted.length + 1;
  sheet.addRow([]);
  const sumRow = sheet.addRow([]);
  sumRow.getCell(labelCol).value = "SUMA:";
  if (sorted.length > 0) {
    sumRow.getCell(priceCol).value = {
      formula: `SUM(${sheet.getColumn(priceCol).letter}2:${sheet.getColumn(priceCol).letter}${lastDataRow})`,
    };
  } else {
    sumRow.getCell(priceCol).value = 0;
  }

  sheet.getColumn(includeAccountColumn ? 2 : 1).width = 12;
  sheet.getColumn(includeAccountColumn ? 3 : 2).width = 26;
  sheet.getColumn(includeAccountColumn ? 4 : 3).width = 16;
  sheet.getColumn(priceCol).width = 18;
  if (includeAccountColumn) sheet.getColumn(1).width = 22;
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonthIso(monthIso: string): string {
  const [year, month] = monthIso.split("-").map(Number);
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
}

function isoToPl(dateIso: string): string {
  const [y, m, d] = dateIso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

// Days to list on the ewidencja sheet: every calendar day of the selected
// period (so days with zero sales still appear, matching the tax-office
// register format) — falls back to just the days sales actually happened
// on when the period has no fixed bounds ("all", or a range missing an
// end), since there's nothing sensible to fill gaps against otherwise.
function ewidencjaDateRange(sales: SaleRow[], period?: PeriodFilterState): string[] {
  if (period) {
    if (period.mode === "day") return [period.date];
    if (period.mode === "month") {
      const from = `${period.month}-01`;
      const to = lastDayOfMonthIso(period.month);
      const days: string[] = [];
      for (let d = from; d <= to; d = addDaysIso(d, 1)) days.push(d);
      return days;
    }
    if (period.mode === "range" && period.from && period.to) {
      const days: string[] = [];
      for (let d = period.from; d <= period.to; d = addDaysIso(d, 1)) days.push(d);
      return days;
    }
  }
  const present = Array.from(
    new Set(sales.map((s) => s.sale_date).filter((d): d is string => Boolean(d)))
  ).sort();
  return present;
}

// Matches the tax-office "ewidencja sprzedaży nieudokumentowanej
// rachunkami" register (daily rows, domestic vs. EU revenue split, sale
// count per day) — the same format used to hand-build these reports before
// this export existed.
function addEwidencjaSheet(
  workbook: import("exceljs").Workbook,
  sales: SaleRow[],
  period: PeriodFilterState | undefined,
  used: Set<string>
) {
  const sheet = workbook.addWorksheet(uniqueSheetName("Ewidencja sprzedaży", used));
  sheet.addRow([
    "LP",
    "Data uzyskania przychodu",
    "Kwota przychodu nieudokumentowanego rachunkami",
    "Kwota przychodu nieudokumentowanego rachunkami EU",
    "Uwagi / opis transakcji",
  ]);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  const byDate = new Map<string, { pl: number; eu: number; count: number }>();
  for (const sale of sales) {
    if (!sale.sale_date) continue;
    const entry = byDate.get(sale.sale_date) ?? { pl: 0, eu: 0, count: 0 };
    if (sale.country === "Polska") entry.pl += sale.sale_price ?? 0;
    else entry.eu += sale.sale_price ?? 0;
    entry.count += 1;
    byDate.set(sale.sale_date, entry);
  }

  const days = ewidencjaDateRange(sales, period);
  let totalPl = 0;
  let totalEu = 0;
  let totalCount = 0;
  days.forEach((date, index) => {
    const entry = byDate.get(date) ?? { pl: 0, eu: 0, count: 0 };
    totalPl += entry.pl;
    totalEu += entry.eu;
    totalCount += entry.count;
    sheet.addRow([
      index + 1,
      isoToPl(date),
      entry.pl > 0 ? entry.pl : null,
      entry.eu > 0 ? entry.eu : null,
      entry.count > 0 ? `${entry.count} sprzedaż` : "",
    ]);
  });

  const totalRow = sheet.addRow([null, "RAZEM", totalPl, totalEu, `${totalCount} sprzedaż`]);
  totalRow.font = { bold: true };

  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = 22;
  sheet.getColumn(3).width = 30;
  sheet.getColumn(4).width = 32;
  sheet.getColumn(5).width = 20;
  sheet.getColumn(3).numFmt = "0.00";
  sheet.getColumn(4).numFmt = "0.00";
}

export async function exportSalesByAccounts(
  sales: SaleRow[],
  selectedAccounts: string[],
  format: AccountExportFormat,
  period?: PeriodFilterState
): Promise<void> {
  const accountSet = new Set(selectedAccounts);
  const filtered = sales.filter((s) => accountSet.has(s.account_name || "—"));

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const usedNames = new Set<string>();

  const byAccount = new Map<string, SaleRow[]>();
  for (const sale of filtered) {
    const key = sale.account_name || "—";
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key)!.push(sale);
  }

  if (format === "single") {
    addAccountSheet(workbook, "Sprzedaż", filtered, usedNames, true);
    addEwidencjaSheet(workbook, filtered, period, usedNames);
  } else {
    for (const account of selectedAccounts) {
      addAccountSheet(workbook, account, byAccount.get(account) ?? [], usedNames, false);
    }
    if (selectedAccounts.length > 1) {
      addAccountSheet(workbook, "Razem", filtered, usedNames, true);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vinted_wybrane_konta_${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
