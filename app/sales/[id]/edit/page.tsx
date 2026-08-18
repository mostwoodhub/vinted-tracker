import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { getItemBrandByNumber, getItemStatusByNumber } from "@/lib/item-numbers";
import { getDistinctValues } from "@/lib/distinct-values";
import { AddSaleForm } from "@/app/sales/add/AddSaleForm";
import type { SaleRow } from "@/lib/sales-types";
import { headingClass, mutedTextClass, pageWrapClass } from "@/lib/ui-classes";

export default async function EditSalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);

  if (!roles.has("admin")) {
    redirect("/warehouse");
  }

  // Independent of each other — fire together instead of one after another.
  const [{ data: sale }, { data }, itemStatusByNumber, itemBrandByNumber, brands] =
    await Promise.all([
      supabaseAdmin.from("sales").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
      supabaseAdmin.from("sales_accounts_archive").select("name").order("sort_order", { ascending: true }),
      getItemStatusByNumber(),
      getItemBrandByNumber(),
      getDistinctValues("items", "brand"),
    ]);

  if (!sale) notFound();

  const accountNames = (data ?? []).map((row) => row.name).filter(Boolean) as string[];

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-[var(--space-lg)] px-6 py-12">
        <div className="flex items-center justify-between gap-4">
          <h1 className={headingClass}>Edytuj sprzedaż</h1>
          <Link href="/sales" className={`text-sm ${mutedTextClass} hover:text-[var(--color-text)]`}>
            ← Lista sprzedaży
          </Link>
        </div>

        <AddSaleForm
          accountNames={accountNames}
          isAdmin={roles.has("admin")}
          initialSale={sale as SaleRow}
          itemStatusByNumber={itemStatusByNumber}
          itemBrandByNumber={itemBrandByNumber}
          brands={brands}
        />
      </div>
    </div>
  );
}
