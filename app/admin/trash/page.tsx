import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { headingClass, pageWrapClass } from "@/lib/ui-classes";
import { TrashList, type TrashItem } from "./TrashList";

export default async function TrashPage() {
  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);

  if (!roles.has("admin")) {
    redirect("/warehouse");
  }

  const { data: items } = await supabaseAdmin
    .from("items")
    .select("id, internal_number, brand, model, size, price, deleted_at, batches(label)")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-[var(--space-lg)] px-6 py-12">
        <div className="flex flex-col gap-1">
          <h1 className={headingClass}>Kosz</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Usunięte towary — można je przywrócić do magazynu.
          </p>
        </div>
        <TrashList items={(items ?? []) as unknown as TrashItem[]} />
      </div>
    </div>
  );
}
