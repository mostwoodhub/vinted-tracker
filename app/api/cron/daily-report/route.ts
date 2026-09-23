import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/fetch-all";
import { warsawDateString } from "@/lib/warsaw-time";
import { formatPln } from "@/lib/format";
import { sendTelegramMessage } from "@/lib/telegram";

// Triggered once a day by the Vercel Cron entry in vercel.json. Vercel
// automatically sends `Authorization: Bearer <CRON_SECRET>` on cron-fired
// requests when CRON_SECRET is set — checked here so this endpoint can't be
// hit by anyone else to spam the Telegram chat.
function isAuthorizedCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type SaleForReport = {
  sale_price: number | null;
  net_profit: number | null;
  created_by: string | null;
  quantity: number | null;
};

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = warsawDateString(new Date());

  const [sales, { data: employees }] = await Promise.all([
    fetchAllRows<SaleForReport>((from, to) =>
      supabaseAdmin
        .from("sales")
        .select("sale_price, net_profit, created_by, quantity")
        .eq("sale_date", today)
        .is("deleted_at", null)
        .range(from, to)
    ),
    supabaseAdmin.from("employees").select("id, full_name"),
  ]);

  const nameById = new Map((employees ?? []).map((e) => [e.id, e.full_name]));

  const byEmployee = new Map<
    string,
    { name: string; count: number; sum: number; profit: number }
  >();
  let totalCount = 0;
  let totalSum = 0;
  let totalProfit = 0;

  for (const sale of sales) {
    const key = sale.created_by ?? "unknown";
    const name = sale.created_by ? (nameById.get(sale.created_by) ?? "Nieznany") : "Nieznany (import/stare dane)";
    const entry = byEmployee.get(key) ?? { name, count: 0, sum: 0, profit: 0 };
    const qty = sale.quantity ?? 1;
    entry.count += qty;
    entry.sum += sale.sale_price ?? 0;
    entry.profit += sale.net_profit ?? 0;
    byEmployee.set(key, entry);

    totalCount += qty;
    totalSum += sale.sale_price ?? 0;
    totalProfit += sale.net_profit ?? 0;
  }

  const employeeLines = Array.from(byEmployee.values())
    .sort((a, b) => b.sum - a.sum)
    .map(
      (e) =>
        `👤 <b>${e.name}</b>: ${e.count} szt. · ${formatPln(e.sum)} · zysk netto: ${formatPln(e.profit)}`
    );

  const lines = [
    `📊 <b>Raport dzienny — ${today}</b>`,
    "",
    employeeLines.length > 0 ? employeeLines.join("\n") : "Brak sprzedaży dzisiaj.",
    "",
    `<b>Razem: ${totalCount} szt. · ${formatPln(totalSum)} · zysk netto: ${formatPln(totalProfit)}</b>`,
  ];

  await sendTelegramMessage(lines.join("\n"));

  return NextResponse.json({
    ok: true,
    date: today,
    totalCount,
    totalSum,
    totalProfit,
    employees: Array.from(byEmployee.values()),
  });
}
