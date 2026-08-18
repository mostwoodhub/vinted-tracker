"use server";

import { revalidatePath } from "next/cache";
import { checkRole, ALL_ROLES } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type ToggleRoleState = {
  status: "idle" | "success" | "error";
  error?: string;
};

export async function toggleExtraRole(
  _prevState: ToggleRoleState,
  formData: FormData
): Promise<ToggleRoleState> {
  const access = await checkRole("admin");
  if (!access.ok) return { status: "error", error: access.error };

  const employeeId = String(formData.get("employeeId") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const enabled = formData.get("enabled") === "true";

  if (!employeeId || !role) {
    return { status: "error", error: "Nieprawidłowe dane" };
  }

  const { data: employee, error: fetchError } = await supabaseAdmin
    .from("employees")
    .select("extra_roles")
    .eq("id", employeeId)
    .single();

  if (fetchError) return { status: "error", error: fetchError.message };

  const current = new Set(employee.extra_roles ?? []);
  if (enabled) current.add(role);
  else current.delete(role);

  const { error: updateError } = await supabaseAdmin
    .from("employees")
    .update({ extra_roles: Array.from(current) })
    .eq("id", employeeId);

  if (updateError) return { status: "error", error: updateError.message };

  revalidatePath("/admin/employees");

  return { status: "success" };
}

export type UpdateLoginState = {
  status: "idle" | "success" | "error";
  error?: string;
};

export async function updateEmployeeLogin(
  _prevState: UpdateLoginState,
  formData: FormData
): Promise<UpdateLoginState> {
  const access = await checkRole("admin");
  if (!access.ok) return { status: "error", error: access.error };

  const employeeId = String(formData.get("employeeId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  if (!employeeId) return { status: "error", error: "Nieprawidłowe dane" };
  if (!email) return { status: "error", error: "Podaj e-mail" };
  if (password && password.length < 8) {
    return { status: "error", error: "Hasło musi mieć min. 8 znaków" };
  }

  const { data: employee, error: fetchError } = await supabaseAdmin
    .from("employees")
    .select("auth_user_id")
    .eq("id", employeeId)
    .single();

  if (fetchError) return { status: "error", error: fetchError.message };
  if (!employee.auth_user_id) {
    return { status: "error", error: "Ten pracownik nie ma konta logowania" };
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    employee.auth_user_id,
    {
      email,
      email_confirm: true,
      ...(password ? { password } : {}),
    }
  );

  if (updateError) return { status: "error", error: updateError.message };

  revalidatePath("/admin/employees");

  return { status: "success" };
}

export type CreateEmployeeState = {
  status: "idle" | "success" | "error";
  error?: string;
  fullName?: string;
  email?: string;
  password?: string;
};

export async function createEmployee(
  _prevState: CreateEmployeeState,
  formData: FormData
): Promise<CreateEmployeeState> {
  const access = await checkRole("admin");
  if (!access.ok) return { status: "error", error: access.error };

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();

  if (!fullName) return { status: "error", error: "Podaj imię i nazwisko" };
  if (!email) return { status: "error", error: "Podaj e-mail" };
  if (password.length < 8) {
    return { status: "error", error: "Hasło musi mieć min. 8 znaków" };
  }
  if (!ALL_ROLES.includes(role as (typeof ALL_ROLES)[number])) {
    return { status: "error", error: "Wybierz rolę" };
  }

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError || !authData.user) {
    return {
      status: "error",
      error: authError?.message ?? "Nie udało się utworzyć konta",
    };
  }

  const { error: employeeError } = await supabaseAdmin.from("employees").insert({
    full_name: fullName,
    role,
    auth_user_id: authData.user.id,
  });

  if (employeeError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return { status: "error", error: employeeError.message };
  }

  revalidatePath("/admin/employees");

  return { status: "success", fullName, email, password };
}
