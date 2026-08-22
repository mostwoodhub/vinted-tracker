import { redirect } from "next/navigation";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { getOlxConnectionInfo } from "@/lib/olx-client";
import {
  buttonPrimaryClass,
  cardClass,
  errorTextClass,
  headingClass,
  mutedTextClass,
  noticeWarningClass,
  pageWrapClass,
  successTextClass,
} from "@/lib/ui-classes";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "medium" });
}

export default async function OlxAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const currentEmployee = await getCurrentEmployee();
  const currentRoles = getEffectiveRoles(currentEmployee);

  if (!currentRoles.has("admin")) {
    redirect("/warehouse");
  }

  const { connected: justConnected, error } = await searchParams;
  const { connected, updatedAt } = await getOlxConnectionInfo();

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-[var(--space-lg)] px-6 py-12">
        <h1 className={headingClass}>Połączenie z OLX</h1>

        {justConnected && (
          <p className={successTextClass}>✓ Konto OLX zostało połączone.</p>
        )}
        {error && <p className={errorTextClass}>{error}</p>}

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
              Bez połączenia automatyczna publikacja na OLX (przycisk „🚀
              Publikuj automatycznie (OLX API)” na stronie Szkice ogłoszeń)
              nie zadziała — OLX wymaga zalogowania się na konto sprzedawcy,
              nie tylko klucza API.
            </p>
          </div>
        )}

        <a
          href="/api/olx/authorize"
          className={`w-fit ${buttonPrimaryClass}`}
        >
          {connected ? "Połącz ponownie" : "Połącz z OLX"}
        </a>

        <p className={`text-xs ${mutedTextClass}`}>
          Otworzy się strona logowania OLX (konto Butmos) — po zatwierdzeniu
          dostępu wrócisz tutaj automatycznie.
        </p>
      </div>
    </div>
  );
}
