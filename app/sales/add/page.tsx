import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { AddSaleForm } from "./AddSaleForm";
import { headingClass, mutedTextClass, pageWrapClass } from "@/lib/ui-classes";

export default async function AddSalePage() {
  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);

  // Any authenticated employee may record a sale — approval (confirmed)
  // stays admin-only, enforced separately in the server action.
  if (roles.size === 0) {
    redirect("/warehouse");
  }

  const isAdmin = roles.has("admin");

  const { data } = await supabaseAdmin
    .from("sales_accounts_archive")
    .select("name")
    .order("sort_order", { ascending: true });

  const accountNames = (data ?? []).map((row) => row.name).filter(Boolean) as string[];

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-[var(--space-lg)] px-6 py-12">
        <div className="flex items-center justify-between gap-4">
          <h1 className={headingClass}>Dodaj sprzedaż</h1>
          <Link
            href="/sales"
            className={`text-sm ${mutedTextClass} hover:text-[var(--color-text)]`}
          >
            ← Lista sprzedaży
          </Link>
        </div>

        <AddSaleForm accountNames={accountNames} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
