"use server";

import { revalidatePath } from "next/cache";
import { checkRole } from "@/lib/auth";
import { startAllegroDeviceFlow, exchangeAllegroDeviceCode } from "@/lib/allegro-client";

export type StartDeviceFlowState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "started"; deviceCode: string; userCode: string; verificationUriComplete: string };

// useActionState requires this signature even though the action takes no input.
export async function startAllegroDeviceFlowAction(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: StartDeviceFlowState
): Promise<StartDeviceFlowState> {
  const access = await checkRole("admin");
  if (!access.ok) return { status: "error", error: access.error };

  const result = await startAllegroDeviceFlow();
  if (!result.ok) return { status: "error", error: result.error };

  return {
    status: "started",
    deviceCode: result.data.deviceCode,
    userCode: result.data.userCode,
    verificationUriComplete: result.data.verificationUriComplete,
  };
}

export type ConfirmDeviceFlowState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; error: string }
  | { status: "connected" };

// Called from the "Sprawdziłem, kontynuuj" button — device codes stay valid
// several minutes, so a manual re-click after approving on Allegro covers
// the wait without needing server-side polling infrastructure.
export async function confirmAllegroDeviceFlowAction(
  _prevState: ConfirmDeviceFlowState,
  formData: FormData
): Promise<ConfirmDeviceFlowState> {
  const access = await checkRole("admin");
  if (!access.ok) return { status: "error", error: access.error };

  const deviceCode = String(formData.get("deviceCode") ?? "").trim();
  if (!deviceCode) return { status: "error", error: "Brak kodu urządzenia" };

  const result = await exchangeAllegroDeviceCode(deviceCode);
  if (!result.ok) {
    if ("pending" in result) return { status: "pending" };
    return { status: "error", error: result.error };
  }

  revalidatePath("/admin/allegro");
  return { status: "connected" };
}
