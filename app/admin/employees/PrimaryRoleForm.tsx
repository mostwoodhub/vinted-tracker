"use client";

import { useActionState } from "react";
import { updatePrimaryRole, type UpdatePrimaryRoleState } from "./actions";
import { errorTextClass, inputClass } from "@/lib/ui-classes";

const initialState: UpdatePrimaryRoleState = { status: "idle" };

export function PrimaryRoleForm({
  employeeId,
  role,
  allRoles,
}: {
  employeeId: string;
  role: string;
  allRoles: readonly string[];
}) {
  const [state, formAction] = useActionState(updatePrimaryRole, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="employeeId" value={employeeId} />
      <select
        name="role"
        defaultValue={role}
        className={`${inputClass} max-w-[10rem]`}
        onChange={(e) => {
          if (e.target.value === role) return;
          if (!confirm(`Zmienić rolę podstawową na „${e.target.value}”?`)) {
            e.target.value = role;
            return;
          }
          e.currentTarget.form?.requestSubmit();
        }}
      >
        {allRoles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {state.status === "error" && <span className={errorTextClass}>{state.error}</span>}
    </form>
  );
}
