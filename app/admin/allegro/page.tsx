import { redirect } from "next/navigation";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { getAllegroConnectionInfo } from "@/lib/allegro-client";
import { AllegroConnect } from "./AllegroConnect";
import { cardClass, headingClass, mutedTextClass, noticeWarningClass, pageWrapClass } from "@/lib/ui-classes";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "medium" });
}

export default async function AllegroAdminPage() {
  const currentEmployee = await getCurrentEmployee();
  const currentRoles = getEffectiveRoles(currentEmployee);

  if (!currentRoles.has("admin")) {
    redirect("/warehouse");
  }

  const { connected, updatedAt } = await getAllegroConnectionInfo();

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-[var(--space-lg)] px-6 py-12">
        <h1 className={headingClass}>Połączenie z Allegro</h1>

        <div className={cardClass}>
          <p className={`text-xs ${mutedTextClass}`}>Status</p>
          <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">
            {connected ? "✓ Połączono" : "✗ Nie połączono"}
          </p>
          {connected && updatedAt && (
            <p className={`mt-1 text-xs ${mutedTextClass}`}>
              Ostatnia odnowa tokenu: {formatDate(updatedAt)}
            </p>
          )}
        </div>

        {!connected && (
          <div className={noticeWarningClass}>
            <p>
              Bez połączenia automatyczna publikacja na Allegro (przycisk „🚀 Publikuj
              automatycznie” na stronie Szkice ogłoszeń) nie zadziała.
            </p>
          </div>
        )}

        <AllegroConnect connected={connected} />

        <p className={`text-xs ${mutedTextClass}`}>
          Allegro używa Device Flow — brak przekierowania, zatwierdzasz dostęp bezpośrednio na
          allegro.pl na koncie sprzedawcy.
        </p>
      </div>
    </div>
  );
}
