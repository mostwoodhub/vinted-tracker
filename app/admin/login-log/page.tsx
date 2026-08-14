import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { summarizeUserAgent } from "@/lib/parse-user-agent";
import { cardClass, headingClass, mutedTextClass, pageWrapClass } from "@/lib/ui-classes";

type LoginLogRow = {
  id: string;
  created_at: string;
  email: string;
  success: boolean;
  employee_name: string | null;
  user_agent: string | null;
  ip_address: string | null;
  error_message: string | null;
};

const LIMIT = 300;

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pl-PL", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

export default async function LoginLogPage() {
  const currentEmployee = await getCurrentEmployee();
  const currentRoles = getEffectiveRoles(currentEmployee);

  if (!currentRoles.has("admin")) {
    redirect("/warehouse");
  }

  const { data } = await supabaseAdmin
    .from("auth_login_log")
    .select("id, created_at, email, success, employee_name, user_agent, ip_address, error_message")
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  const rows = (data ?? []) as LoginLogRow[];

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-[var(--space-lg)] px-6 py-12">
        <div className="flex flex-col gap-1">
          <h1 className={headingClass}>Historia logowań</h1>
          <p className={`text-sm ${mutedTextClass}`}>
            Ostatnie {LIMIT} prób logowania — kto, kiedy, z jakiego urządzenia. Sprawdzaj
            tu, jeśli podejrzewasz logowanie z nieznanego urządzenia.
          </p>
        </div>

        {rows.length === 0 && (
          <p className={`text-sm ${mutedTextClass}`}>Brak zapisanych logowań.</p>
        )}

        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className={`flex flex-col gap-1 ${cardClass} ${row.success ? "" : "border border-[var(--color-danger)]"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-[var(--color-text)]">
                  {row.success ? "✅" : "❌"} {row.employee_name || row.email}
                </span>
                <span className={`text-xs ${mutedTextClass}`}>{formatDate(row.created_at)}</span>
              </div>
              <p className={`text-xs ${mutedTextClass}`}>
                {row.email} · {summarizeUserAgent(row.user_agent)}
                {row.ip_address ? ` · ${row.ip_address}` : ""}
              </p>
              {!row.success && row.error_message && (
                <p className="text-xs text-[var(--color-danger)]">{row.error_message}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
