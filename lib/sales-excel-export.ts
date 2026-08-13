"use client";

import type { SaleRow } from "@/lib/sales-types";
import { computeSalesStatistics, type ProfileRow } from "@/lib/sales-stats";
import { computeBatchPerformance } from "@/lib/batch-stats";
import { EXPENSE_CATEGORY_ROWS } from "@/lib/expense-categories";
import { formatPeriodLabel, type PeriodFilterState } from "@/lib/period-filter";

type ExpenseRow = { expense_date?: string | null; category: string | null; amount: number | null };
type BatchExpenseRow = { batch_name: string | null; amount: number | null };

function n2(value: number): string {
  return value.toFixed(2);
}

function nowLabel(): string {
  const d = new Date();
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export async function exportFullReport(params: {
  sales: SaleRow[];
  allSales: SaleRow[];
  expenses: ExpenseRow[];
  allBatchExpenses: BatchExpenseRow[];
  profiles: ProfileRow[];
  period: PeriodFilterState;
}) {
  const { sales, allSales, expenses, allBatchExpenses, profiles, period } = params;
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const periodLabel = formatPeriodLabel(period);

  // --- Sheet 1: Sprzedaż ---
  const salesSheet = workbook.addWorksheet("Sprzedaż");
  salesSheet.addRow([
    "Nr",
    "Data",
    "Platforma",
    "Nr obuwia",
    "Ilość",
    "Kupujący",
    "Konto",
    "Kraj",
    "Cena sprzedaży (zł)",
    "Koszt własny (zł)",
    "Prowizja",
    "Stawka VAT (%)",
    "VAT (zł)",
    "Podatek dochodowy 3% (zł)",
    "Zysk netto (zł)",
    "",
    `Okres raportu: ${periodLabel}`,
  ]);
  sales.forEach((sale, index) => {
    salesSheet.addRow([
      index + 1,
      sale.sale_date ?? "",
      sale.platform ?? "",
      sale.legacy_shoe_id ?? "",
      sale.quantity ?? 1,
      sale.buyer_name ?? "",
      sale.account_name ?? "",
      sale.country ?? "",
      sale.sale_price ?? 0,
      sale.cost_price ?? 0,
      `${sale.fee_percent ?? 0}% (${n2(sale.fee_amount ?? 0)} zł)`,
      sale.vat_rate ?? 0,
      sale.vat_amount ?? 0,
      sale.income_tax_amount ?? 0,
      sale.net_profit ?? 0,
    ]);
  });

  // --- Sheet 2: Statystyki ---
  const stats = computeSalesStatistics(sales, expenses, profiles);
  const statsSheet = workbook.addWorksheet("Statystyki");
  statsSheet.addRow(["Okres raportu", periodLabel]);
  statsSheet.addRow(["Wygenerowano", nowLabel()]);
  statsSheet.addRow([]);
  statsSheet.addRow(["Podsumowanie"]);
  statsSheet.addRow(["Liczba sprzedaży", stats.count]);
  statsSheet.addRow(["Łączny przychód (zł)", n2(stats.totalRevenue)]);
  statsSheet.addRow(["Łączny koszt własny (zł)", n2(stats.totalCostOwn)]);
  statsSheet.addRow(["Łączne prowizje (zł)", n2(stats.totalFees)]);
  statsSheet.addRow(["Łączny VAT (zł)", n2(stats.totalVat)]);
  statsSheet.addRow(["Łączny podatek dochodowy 3% (zł)", n2(stats.totalIncomeTax)]);
  statsSheet.addRow(["Zysk ze sprzedaży, przed wydatkami (zł)", n2(stats.salesProfit)]);
  statsSheet.addRow([]);
  statsSheet.addRow(["Wydatki (wszystkie kategorie)"]);
  for (const row of EXPENSE_CATEGORY_ROWS) {
    statsSheet.addRow([`  ${row.emoji} ${row.label}`, n2(stats.expenseCategories[row.key])]);
  }
  statsSheet.addRow(["Razem wydatki (zł)", n2(stats.totalExpensesAmount)]);
  statsSheet.addRow([]);
  statsSheet.addRow(["Finalny zysk netto, po wydatkach (zł)", n2(stats.finalNetProfit)]);
  statsSheet.addRow([]);
  statsSheet.addRow(["Przepływ gotówki w tym okresie"]);
  statsSheet.addRow(["  Wpłynęło (sprzedaż, zł)", n2(stats.cashIn)]);
  statsSheet.addRow(["  Wypłynęło (wydatki, zł)", n2(stats.cashOut)]);
  statsSheet.addRow(["  Saldo gotówkowe (zł)", n2(stats.cashBalance)]);
  statsSheet.getColumn(1).width = 40;
  statsSheet.getColumn(2).width = 20;

  // --- Sheet 3: Rozbicie ---
  const breakdownSheet = workbook.addWorksheet("Rozbicie");
  breakdownSheet.addRow([`Okres raportu: ${periodLabel}`]);
  breakdownSheet.addRow([]);

  function addBreakdownBlock(title: string, keyLabel: string, rows: typeof stats.byPlatform) {
    breakdownSheet.addRow([title]);
    breakdownSheet.addRow([keyLabel, "Liczba sprzedaży", "Zysk netto (zł)"]);
    for (const row of rows) {
      breakdownSheet.addRow([row.key, row.count, n2(row.totalProfit)]);
    }
    breakdownSheet.addRow([]);
  }

  addBreakdownBlock("Wg platformy", "Platforma", stats.byPlatform);
  addBreakdownBlock("Wg konta", "Konto", stats.byAccount);
  addBreakdownBlock("Wg kraju", "Kraj", stats.byCountry);
  addBreakdownBlock("Wg pracownika (tylko Ty widzisz)", "Pracownik", stats.byEmployee);
  breakdownSheet.getColumn(1).width = 28;
  breakdownSheet.getColumn(2).width = 18;
  breakdownSheet.getColumn(3).width = 18;

  // --- Sheet 4: Partie obuwia (all-time, not period-scoped — cumulative break-even) ---
  const batchSheet = workbook.addWorksheet("Partie obuwia");
  batchSheet.addRow(["Partia", "Koszt (zł)", "Przychód netto (zł)", "Status", "Liczba sprzedaży"]);
  const batches = computeBatchPerformance(allSales, allBatchExpenses);
  for (const batch of batches) {
    batchSheet.addRow([
      batch.name,
      n2(batch.cost),
      n2(batch.netRevenue),
      batch.breakEvenReached
        ? `Próg osiągnięty (+${n2(batch.remaining)} zł)`
        : `Pozostało ${n2(batch.remaining)} zł`,
      batch.saleCount,
    ]);
  }
  batchSheet.getColumn(1).width = 14;
  batchSheet.getColumn(2).width = 14;
  batchSheet.getColumn(3).width = 18;
  batchSheet.getColumn(4).width = 24;
  batchSheet.getColumn(5).width = 16;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sprzedaz-raport-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
