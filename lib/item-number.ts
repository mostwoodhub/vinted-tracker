// Prefers the old, manually-entered shoe number ("Stary numer") the manager
// writes on physical stock — the business still identifies items by that
// scheme, not by this app's own auto-incrementing counter. Only items added
// without one (or the system's own counter) fall back to batch letter +
// internal_number.
export function formatItemNumber(
  batchLabel: string | null | undefined,
  internalNumber: number | string,
  legacyNumber?: string | null
): string {
  const legacy = legacyNumber?.trim();
  if (legacy) return legacy;
  return batchLabel ? `${batchLabel}${internalNumber}` : String(internalNumber);
}
