export function formatItemNumber(
  batchLabel: string | null | undefined,
  internalNumber: number | string
): string {
  return batchLabel ? `${batchLabel}${internalNumber}` : String(internalNumber);
}
