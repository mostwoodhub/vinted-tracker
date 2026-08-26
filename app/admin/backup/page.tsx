import { redirect } from "next/navigation";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import {
  buttonPrimaryClass,
  headingClass,
  mutedTextClass,
  pageWrapClass,
} from "@/lib/ui-classes";

export default async function BackupPage() {
  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);

  if (!roles.has("admin")) {
    redirect("/warehouse");
  }

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-[var(--space-lg)] px-6 py-12">
        <h1 className={headingClass}>Kopia zapasowa</h1>
        <p className={`text-sm ${mutedTextClass}`}>
          Pobiera pełną kopię wszystkich danych (towary, sprzedaże, partie,
          wydatki, pracownicy, zdjęcia, publikacje, historia logowań) jako
          jeden plik JSON. Tokeny logowania do Allegro/OLX celowo nie są
          w to wliczone.
        </p>
        <a href="/api/backup" className={`self-start ${buttonPrimaryClass}`}>
          📥 Pobierz pełną kopię zapasową (JSON)
        </a>
      </div>
    </div>
  );
}
