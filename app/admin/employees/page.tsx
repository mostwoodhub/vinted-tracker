import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ALL_ROLES, getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { RoleToggle } from "./RoleToggle";
import { CreateEmployeeForm } from "./CreateEmployeeForm";
import { EditEmployeeForm } from "./EditEmployeeForm";
import { cardClass, headingClass, mutedTextClass, pageWrapClass } from "@/lib/ui-classes";

type EmployeeRow = {
  id: string;
  full_name: string;
  role: string;
  extra_roles: string[];
  auth_user_id: string | null;
};

export default async function EmployeesPage() {
  const currentEmployee = await getCurrentEmployee();
  const currentRoles = getEffectiveRoles(currentEmployee);

  if (!currentRoles.has("admin")) {
    redirect("/warehouse");
  }

  // Independent of each other — fire together instead of one after another.
  const [{ data: employees }, { data: authUsers }] = await Promise.all([
    supabaseAdmin
      .from("employees")
      .select("id, full_name, role, extra_roles, auth_user_id")
      .order("full_name", { ascending: true }),
    // Email lives on the Supabase Auth user, not the `employees` row itself.
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const rows = (employees ?? []) as EmployeeRow[];
  const emailByAuthUserId = new Map(
    (authUsers?.users ?? []).map((u) => [u.id, u.email ?? null])
  );

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-[var(--space-lg)] px-6 py-12">
        <h1 className={headingClass}>Pracownicy</h1>

        <CreateEmployeeForm />

        {rows.length === 0 && (
          <p className={`text-sm ${mutedTextClass}`}>Brak pracowników.</p>
        )}

        <div className="flex flex-col gap-[var(--gap-default)]">
          {rows.map((employee) => {
            const extraRoles = new Set(employee.extra_roles ?? []);
            const toggleableRoles = ALL_ROLES.filter(
              (role) => role !== employee.role
            );

            return (
              <div key={employee.id} className={`flex flex-col gap-3 ${cardClass}`}>
                <div>
                  <p className="font-medium text-[var(--color-text)]">
                    {employee.full_name}
                  </p>
                  <p className={`text-xs ${mutedTextClass}`}>
                    Rola podstawowa: {employee.role}
                  </p>
                </div>

                <div className="flex flex-col gap-1">
                  <span className={`text-xs ${mutedTextClass}`}>
                    Dane logowania
                  </span>
                  <EditEmployeeForm
                    employeeId={employee.id}
                    fullName={employee.full_name}
                    email={
                      employee.auth_user_id
                        ? emailByAuthUserId.get(employee.auth_user_id) ?? null
                        : null
                    }
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <span className={`text-xs ${mutedTextClass}`}>
                    Dodatkowe role
                  </span>
                  <div className="flex flex-wrap gap-4">
                    {toggleableRoles.map((role) => (
                      <RoleToggle
                        key={role}
                        employeeId={employee.id}
                        role={role}
                        checked={extraRoles.has(role)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
