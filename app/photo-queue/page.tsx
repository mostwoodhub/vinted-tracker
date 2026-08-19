import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatItemNumber } from "@/lib/item-number";
import { getCurrentEmployee } from "@/lib/auth";
import { warsawDateString } from "@/lib/warsaw-time";
import { IdleReminder } from "@/app/IdleReminder";
import { IntakeStatsSection, type IntakeItem } from "@/app/dashboard/IntakeStatsSection";
import { cardClass, cardSmClass, headingClass, mutedTextClass, pageWrapClass } from "@/lib/ui-classes";

// Shown to the photographer themselves, right on the queue they work from —
// so they can see their own uploads are actually being recorded, not just
// admin looking at a dashboard elsewhere. Full history (not date-bounded)
// since it also feeds the day/week/month browsable chart below the list.
async function fetchOwnPhotoLog(employeeId: string): Promise<IntakeItem[]> {
  const { data } = await supabaseAdmin
    .from("item_status_log")
    .select("changed_at")
    .eq("changed_by", employeeId)
    .eq("to_status", "photos_uploaded");

  return (data ?? [])
    .filter((log) => log.changed_at)
    .map((log) => ({ employeeId, createdAt: log.changed_at as string }));
}

export default async function PhotoQueuePage() {
  const employee = await getCurrentEmployee();
  const todayWarsaw = warsawDateString(new Date());

  const [{ data: items }, ownPhotos] = await Promise.all([
    supabaseAdmin
      .from("items")
      .select("id, internal_number, legacy_number, brand, size, batches(label)")
      .eq("status", "received")
      .is("deleted_at", null)
      .order("internal_number", { ascending: true }),
    employee ? fetchOwnPhotoLog(employee.id) : Promise.resolve(null),
  ]);

  const todayCount =
    ownPhotos?.filter((log) => warsawDateString(new Date(log.createdAt)) === todayWarsaw).length ?? null;

  const rows = (items ?? []) as unknown as {
    id: string;
    internal_number: number;
    legacy_number: string | null;
    brand: string | null;
    size: string | null;
    batches: { label: string | null } | null;
  }[];

  return (
    <div className={pageWrapClass}>
      <IdleReminder />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-[var(--space-lg)] px-6 py-12">
        {todayCount != null && (
          <div className={`${cardSmClass} flex items-center justify-between`}>
            <span className={`text-sm ${mutedTextClass}`}>Dzisiaj sfotografowałeś</span>
            <span className="text-xl font-bold text-[var(--color-text)]">{todayCount}</span>
          </div>
        )}
        <h1 className={headingClass}>Towary do zdjęć</h1>

        {rows.length === 0 && (
          <p className={`text-sm ${mutedTextClass}`}>
            Brak towarów oczekujących na zdjęcia.
          </p>
        )}

        <ul className="flex flex-col gap-[var(--gap-default)]">
          {rows.map((item) => (
            <li key={item.id} className={cardClass}>
              <Link
                href={`/items/${item.id}`}
                className="flex items-center justify-between gap-3"
              >
                <span className="font-bold text-[var(--color-text)]">
                  📸{" "}
                  {formatItemNumber(item.batches?.label, item.internal_number, item.legacy_number)}
                </span>
                <span className={`text-sm ${mutedTextClass}`}>
                  {[item.brand, item.size].filter(Boolean).join(" · ") || "—"}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {employee && ownPhotos && (
          <IntakeStatsSection
            items={ownPhotos}
            displayNames={{ [employee.id]: employee.full_name }}
            todayWarsaw={todayWarsaw}
            heading="Twoje sfotografowane towary"
            caveatText="Liczone od 19.08.2026 — starsze zdjęcia nie mają zapisanego, kto je zrobił."
            emptyStateText="Nie sfotografowałeś jeszcze żadnego towaru w tym okresie."
            chartTitle="Chronologia Twojego fotografowania"
            chartSubtitle="Każda kropka to jeden sfotografowany przez Ciebie towar, z dokładnym czasem."
          />
        )}
      </div>
    </div>
  );
}
