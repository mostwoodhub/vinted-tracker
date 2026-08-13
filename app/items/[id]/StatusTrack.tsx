const STEPS = [
  { key: "received", label: "Przyjęto" },
  { key: "photos_uploaded", label: "Zdjęcia" },
  { key: "ai_card_ready", label: "Karta AI" },
  { key: "published", label: "Publikacja" },
  { key: "sold", label: "Sprzedano" },
];

export function StatusTrack({ status }: { status: string }) {
  const currentIndex = STEPS.findIndex((step) => step.key === status);

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
