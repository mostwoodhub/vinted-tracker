const STEPS = [
  { key: "received", label: "Przyjęto" },
  { key: "photos_uploaded", label: "Zdjęcia" },
  { key: "ai_card_ready", label: "Karta AI" },
  { key: "ready_to_publish", label: "Gotowe" },
  { key: "published", label: "Publikacja" },
  { key: "sold", label: "Sprzedano" },
];

export function StatusTrack({ status }: { status: string }) {
  const currentIndex = STEPS.findIndex((step) => step.key === status);

  // Not a forward step in the pipeline — an item lands here from
  // "published" and then goes back to "ready_to_publish" or
  // "photos_uploaded" (see RETURN_NEXT_STATUSES), so it doesn't have a
  // sensible position in a left-to-right track. Shown as its own banner
  // instead of forcing it into STEPS, where findIndex would return -1 and
  // leave every step looking neither done nor current.
  if (status === "returned") {
    return (
      <div className="flex w-fit items-center gap-2 rounded-full bg-[var(--color-warning-bg)] px-3 py-1.5 text-xs font-medium text-[var(--color-warning)]">
        ↩️ Zwrócono — czeka na wybór kolejnego kroku
      </div>
    );
  }

  return (
    <ol className="flex items-center">
      {STEPS.map((step, index) => {
        const isCurrent = index === currentIndex;
        const isDone = currentIndex >= 0 && index < currentIndex;

        return (
          <li
            key={step.key}
            className="flex flex-1 items-center last:flex-none"
          >
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium " +
                  (isCurrent
                    ? "bg-[var(--color-accent)] text-white"
                    : isDone
                      ? "bg-[var(--color-success)] text-white"
                      : "bg-[var(--color-surface)] text-[var(--color-text-muted)]")
                }
              >
                {isDone ? "✓" : index + 1}
              </div>
              <span
                className={
                  "whitespace-nowrap text-xs " +
                  (isCurrent
                    ? "font-medium text-[var(--color-text)]"
                    : "text-[var(--color-text-muted)]")
                }
              >
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={
                  "mx-2 h-px flex-1 " +
                  (isDone
                    ? "bg-[var(--color-success)]"
                    : "bg-[var(--color-surface)]")
                }
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
