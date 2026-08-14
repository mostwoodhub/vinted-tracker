"use client";

import { useState } from "react";
import type { SaleRow } from "@/lib/sales-types";
import type { ProfileRow } from "@/lib/sales-stats";
import type { PeriodFilterState } from "@/lib/period-filter";
import { exportFullReport } from "@/lib/sales-excel-export";
import { PrintLabelsModal } from "@/app/sales/PrintLabelsModal";
import { ExportByAccountModal } from "@/app/ExportByAccountModal";
import { buttonSecondaryClass } from "@/lib/ui-classes";

type ExpenseRow = { expense_date?: string | null; category: string | null; amount: number | null };
type BatchExpenseRow = { batch_name: string | null; amount: number | null };

export function SalesActionBar({
  sales,
  allSales,
  expenses,
  allBatchExpenses,
  profiles,
  period,
  accountNames,
}: {
  sales: SaleRow[];
  allSales?: SaleRow[];
  expenses?: ExpenseRow[];
  allBatchExpenses?: BatchExpenseRow[];
  profiles?: ProfileRow[];
  period?: PeriodFilterState;
  accountNames?: string[];
}) {
  const [exporting, setExporting] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [accountExportOpen, setAccountExportOpen] = useState(false);

  async function handleFullExport() {
    setExporting(true);
    try {
      await exportFullReport({
        sales,
        allSales: allSales ?? sales,
        expenses: expenses ?? [],
        allBatchExpenses: allBatchExpenses ?? [],
        profiles: profiles ?? [],
        period: period ?? { mode: "all" },
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="no-print flex flex-wrap gap-2">
      <button type="button" onClick={() => setPrintModalOpen(true)} className={buttonSecondaryClass}>
        🖨️ Drukuj
      </button>
      <button
        type="button"
        onClick={() => setAccountExportOpen(true)}
        className={buttonSecondaryClass}
      >
        Eksport po kontach
      </button>
      <button
        type="button"
        onClick={handleFullExport}
        disabled={exporting}
        className={buttonSecondaryClass}
      >
        {exporting ? "Generowanie…" : "Eksport Excel"}
      </button>

      {printModalOpen && (
        <PrintLabelsModal
          sales={allSales ?? sales}
          onClose={() => setPrintModalOpen(false)}
          initialPeriod={period}
        />
      )}
      {accountExportOpen && (
        <ExportByAccountModal
          sales={allSales ?? sales}
          accountNames={accountNames}
          onClose={() => setAccountExportOpen(false)}
          initialPeriod={period}
        />
      )}
    </div>
  );
}
