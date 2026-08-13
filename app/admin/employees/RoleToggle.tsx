"use client";

import { useActionState, useEffect } from "react";
import { toggleExtraRole, type ToggleRoleState } from "./actions";
import { checkboxClass } from "@/lib/ui-classes";

const initialState: ToggleRoleState = { status: "idle" };

export function RoleToggle({
  employeeId,
  role,
  checked,
}: {
  employeeId: string;
  role: string;
  checked: boolean;
}) {
  const [state, formAction] = useActionState(toggleExtraRole, initialState);

  useEffect(() => {
    if (state.status === "error") {
      // eslint-disable-next-line no-alert
      alert(state.error);
    }
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="enabled" value={(!checked).toString()} />
      <label className="flex items-center gap-1.5 text-sm text-[var(--color-text)]">
        <input
          type="checkbox"
          defaultChecked={checked}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className={checkboxClass}
        />
        {role}
      </label>
    </form>
  );
}
