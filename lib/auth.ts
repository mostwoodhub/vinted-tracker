import "server-only";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { type Role, ALL_ROLES } from "@/lib/roles";

export type { Role };
export { ALL_ROLES };

export type Employee = {
  id: string;
  full_name: string;
  role: string;
  extra_roles: string[];
};

export async function getCurrentEmployee(): Promise<Employee | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: employee } = await supabaseAdmin
    .from("employees")
    .select("id, full_name, role, extra_roles")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return employee;
}

export function getEffectiveRoles(employee: Employee | null): Set<string> {
  if (!employee) return new Set();
  return new Set([employee.role, ...(employee.extra_roles ?? [])]);
}

export type RoleCheckResult =
  | { ok: true; employee: Employee }
  | { ok: false; error: string };

export async function checkRole(
  ...allowedRoles: Role[]
): Promise<RoleCheckResult> {
  const employee = await getCurrentEmployee();

  if (!employee) {
    return { ok: false, error: "Musisz być zalogowany" };
  }

  const roles = getEffectiveRoles(employee);
  const allowed = allowedRoles.some((role) => roles.has(role));

  if (!allowed) {
    return { ok: false, error: "Brak uprawnień do wykonania tej akcji" };
  }

  return { ok: true, employee };
}
