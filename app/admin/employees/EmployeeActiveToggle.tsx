"use client";

import { useActionState } from "react";
import { setEmployeeActive, type SetEmployeeActiveState } from "./actions";
import { buttonDangerOutlineClass, buttonSecondaryClass, errorTextClass } from "@/lib/ui-classes";

const initialState: SetEmployeeActiveState = { status: "idle" };

export function EmployeeActiveToggle({
  employeeId,
  isActive,
  isSelf,
}: {
  employeeId: string;
  isActive: boolean;
  isSelf: boolean;
}) {
  const [state, formAction] = useActionState(setEmployeeActive, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (isActive && !confirm("Zablokować logowanie temu pracownikowi?")) {
          e.preventDefault();
        }
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="active" value={(!isActive).toString()} />
      <button
        type="submit"
        disabled={isSelf && isActive}
        title={isSelf && isActive ? "Nie możesz zablokować własnego konta" : undefined}
        className={isActive ? buttonDangerOutlineClass : buttonSecondaryClass}
      >
        {isActive ? "🔒 Zablokuj logowanie" : "🔓 Odblokuj logowanie"}
      </button>
      {state.status === "error" && <span className={errorTextClass}>{state.error}</span>}
    </form>
  );
}
