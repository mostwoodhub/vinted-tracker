import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all";
import type { SaleRow } from "@/lib/sales-types";
import type { MatchableItem } from "@/lib/sales-stats";
import { computeBatchPayback } from "@/lib/batch-stats";
import { daysBetween } from "@/lib/day-buckets";
import {
  StatisticsView,
  type ExpenseRow,
  type ProfileRow,
  type SoldTiming,
  type ReturnEvent,
} from "./StatisticsView";

export default async function StatisticsPage() {
  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);

  if (!roles.has("admin")) {
    redirect("/warehouse");
  }

  // Independent of each other — fire together instead of waiting on each
  // one's round trip before starting the next.
  const [sales, expenses, { data: profiles }, { data: realBatches }, itemRows, statusLogRows] =
    await Promise.all([
      fetchAllRows<SaleRow>((from, to) =>
        supabaseAdmin
          .from("sales")
          .select("*")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range(from, to)
      ),
      fetchAllRows<ExpenseRow>((from, to) =>
        supabaseAdmin
          .from("expenses")
          .select("expense_date, category, amount, batch_name")
          .is("deleted_at", null)
          .order("expense_date", { ascending: false })
          .range(from, to)
      ),
      supabaseAdmin.from("sales_profiles_archive").select("id, email, display_name"),
      supabaseAdmin.from("batches").select("label, purchase_cost, sales_amount"),
      // Includes deleted items too — matching is about historical linkage
      // for reporting, not current warehouse state. id/created_at/deleted_at
      // are used below to compute time-to-sell and filter return events to
      // still-active items only. Paginated: a plain .select() silently caps
      // at PostgREST's 1000-row default, and this table is already close to
      // that line.
      fetchAllRows<{
        id: string;
        internal_number: number;
        legacy_number: string | null;
        brand: string | null;
        size: string | null;
        price: number | null;
        created_at: string | null;
        deleted_at: string | null;
        batches: { label: string | null } | { label: string | null }[] | null;
      }>((from, to) =>
        supabaseAdmin
          .from("items")
          .select("id, internal_number, legacy_number, brand, size, price, created_at, deleted_at, batches(label)")
          .range(from, to)
      ),
      // "sold"/"returned" transitions, each logged exactly once per item at
      // the moment it happened (see item-sale-link.ts and
      // items/[id]/actions.ts) — the reliable source for "how long did this
      // take" and "how often does a sale get returned", instead of guessing
      // from items' current status.
      fetchAllRows<{ item_id: string; to_status: string; changed_at: string | null }>(
        (from, to) =>
          supabaseAdmin
            .from("item_status_log")
            .select("item_id, to_status, changed_at")
            .in("to_status", ["sold", "returned"])
            .range(from, to)
      ),
    ]);

  const batchPayback = computeBatchPayback(sales, expenses, realBatches ?? []);

  const activeItemById = new Map(
    (itemRows ?? []).filter((row) => !row.deleted_at).map((row) => [row.id, row])
  );

  const soldTimings: SoldTiming[] = [];
  const returnEvents: ReturnEvent[] = [];
  for (const log of statusLogRows) {
    const item = activeItemById.get(log.item_id);
    if (!item || !log.changed_at) continue;
    const date = log.changed_at.slice(0, 10);
    if (log.to_status === "sold") {
      soldTimings.push({
        soldDate: date,
        daysToSell: item.created_at ? daysBetween(item.created_at, log.changed_at) : 0,
      });
    } else if (log.to_status === "returned") {
      returnEvents.push({ date });
    }
  }

  const items: MatchableItem[] = (itemRows ?? []).map((row) => {
    const batches = row.batches as
      | { label: string | null }
      | { label: string | null }[]
      | null;
    const batchLabel = Array.isArray(batches)
      ? batches[0]?.label ?? null
      : batches?.label ?? null;
    return {
      internalNumber: row.internal_number,
      legacyNumber: row.legacy_number,
      batchLabel,
      brand: row.brand,
      size: row.size,
      price: row.price,
    };
  });

  return (
    <StatisticsView
      sales={sales}
      expenses={expenses}
      profiles={(profiles ?? []) as ProfileRow[]}
      items={items}
      batchPayback={batchPayback}
      soldTimings={soldTimings}
      returnEvents={returnEvents}
    />
  );
}
