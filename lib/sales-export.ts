"use client";

import type { SaleRow } from "@/lib/sales-types";

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

export async function exportSalesByAccounts(
  sales: SaleRow[],
  selectedAccounts: string[],
  format: AccountExportFormat
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
