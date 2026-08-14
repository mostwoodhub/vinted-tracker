"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type LoginState = {
  status: "idle" | "error";
  error?: string;
};

// x-forwarded-for can carry a comma-separated chain of proxies (client, then
// any intermediaries) — the first entry is the original client. Vercel sets
// this automatically; locally it's usually absent.
async function requestMeta() {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  return {
    userAgent: h.get("user-agent"),
    ipAddress: forwardedFor ? forwardedFor.split(",")[0].trim() : (h.get("x-real-ip") ?? null),
  };
}

async function logLoginAttempt(params: {
  email: string;
  success: boolean;
  employeeId?: string | null;
  employeeName?: string | null;
  errorMessage?: string | null;
}) {
  const { userAgent, ipAddress } = await requestMeta();
  // Best-effort logging — a failure here should never block an actual login.
  try {
    await supabaseAdmin.from("auth_login_log").insert({
      email: params.email,
      success: params.success,
      employee_id: params.employeeId ?? null,
      employee_name: params.employeeName ?? null,
      user_agent: userAgent,
      ip_address: ipAddress,
      error_message: params.errorMessage ?? null,
    });
  } catch (err) {
    console.error("Nie udało się zapisać wpisu w historii logowań", err);
  }
}

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { status: "error", error: "Podaj e-mail i hasło" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    await logLoginAttempt({ email, success: false, errorMessage: error.message });
    return { status: "error", error: "Nieprawidłowy e-mail lub hasło" };
  }

  const { data: employee } = await supabaseAdmin
    .from("employees")
    .select("id, full_name")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  await logLoginAttempt({
    email,
    success: true,
    employeeId: employee?.id ?? null,
    employeeName: employee?.full_name ?? null,
  });

  redirect("/warehouse");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
