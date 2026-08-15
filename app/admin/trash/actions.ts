"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRole } from "@/lib/auth";

export async function restoreItem(itemId: string) {
  const access = await checkRole("admin");
  if (!access.ok) throw new Error(access.error);

  const { error } = await supabaseAdmin
    .from("items")
    .update({ deleted_at: null })
    .eq("id", itemId);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/trash");
  revalidatePath("/warehouse");
  revalidatePath("/pending");
}
