import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all";
import { AccountsSection, type AccountRow } from "./AccountsSection";
import { ARCHIWUM_2025_ACCOUNT_NAME } from "@/lib/archiwum";
import { headingClass, mutedTextClass, pageWrapClass } from "@/lib/ui-classes";

export default async function AccountsPage() {
  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);

  if (!roles.has("admin")) {
    redirect("/warehouse");
  }

  const { data: accountsRaw } = await supabaseAdmin
    .from("sales_accounts_archive")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true });

  const sales = await fetchAllRows<{ account_name: string | null }>((from, to) =>
    supabaseAdmin
      .from("sales")
      .select("account_name")
      .is("deleted_at", null)
      .range(from, to)
  );

  const countByName = new Map<string, number>();
  for (const sale of sales) {
    if (!sale.account_name) continue;
    countByName.set(sale.account_name, (countByName.get(sale.account_name) ?? 0) + 1);
  }

  const accounts: AccountRow[] = (accountsRaw ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    saleCount: countByName.get(a.name) ?? 0,
  }));

  const archiwumImported = accounts.some((a) => a.name === ARCHIWUM_2025_ACCOUNT_NAME);

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-[var(--space-lg)] px-6 py-12">
        <div className="flex flex-col gap-1">
          <h1 className={headingClass}>Konta</h1>
          <p className={`text-sm ${mutedTextClass}`}>
            Konta sprzedażowe używane przy dodawaniu sprzedaży i eksporcie po kontach.
          </p>
        </div>
        <AccountsSection accounts={accounts} archiwumImported={archiwumImported} />
      </div>
    </div>
  );
}
