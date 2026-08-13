export const pageWrapClass = "w-full flex-1 bg-[var(--color-bg)]";

export const headingClass =
  "text-2xl font-semibold tracking-tight text-[var(--color-text)]";

export const cardClass =
  "rounded-[var(--radius-md)] bg-[var(--color-surface)] p-[var(--card-padding)]";

export const cardSmClass =
  "rounded-[var(--radius-sm)] bg-[var(--color-surface)] p-[var(--space-md)]";

export const inputClass =
  "rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]";

export const labelClass = "text-sm font-medium text-[var(--color-text)]";

export const mutedTextClass = "text-[var(--color-text-muted)]";

export const errorTextClass = "text-sm text-[var(--color-danger)]";

export const successTextClass = "text-sm text-[var(--color-success)]";

export const checkboxClass =
  "h-4 w-4 rounded accent-[var(--color-accent)]";

export function dropzoneClass(active: boolean) {
  return (
    "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--radius-sm)] border-2 border-dashed px-4 py-6 text-center text-sm transition-colors " +
    (active
      ? "border-[var(--color-accent)] bg-[var(--color-accent-bg)] text-[var(--color-accent-fg)]"
      : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-text)]")
  );
}

export function pillClass(active: boolean) {
  return (
    "rounded-full px-4 py-2 text-sm font-medium transition-colors " +
    (active
      ? "bg-[var(--color-accent)] text-white"
      : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]")
  );
}

export const buttonPrimaryClass =
  "flex h-10 items-center justify-center rounded-full bg-[var(--color-accent)] px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";

export const buttonSecondaryClass =
  "flex h-10 items-center justify-center rounded-full bg-[var(--color-surface-2)] px-5 text-sm font-medium text-[var(--color-text)] transition-opacity hover:opacity-80 disabled:opacity-50";

export const buttonSuccessClass =
  "flex h-10 items-center justify-center rounded-full bg-[var(--color-success-solid)] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50";

export const buttonDangerClass =
  "flex h-10 items-center justify-center rounded-full bg-[var(--color-danger)] px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";

export const buttonDangerOutlineClass =
  "flex h-10 items-center justify-center rounded-full bg-[var(--color-danger-bg)] px-5 text-sm font-medium text-[var(--color-danger)] transition-opacity hover:opacity-80";

export const buttonWarningOutlineClass =
  "flex h-10 items-center justify-center rounded-full bg-[var(--color-warning-bg)] px-5 text-sm font-medium text-[var(--color-warning)] transition-opacity hover:opacity-80 disabled:opacity-50";

export const noticeSuccessClass =
  "flex flex-col gap-1 rounded-[var(--radius-sm)] bg-[var(--color-success-bg)] px-4 py-3 text-sm text-[var(--color-success)]";

export const noticeWarningClass =
  "flex flex-col gap-2 rounded-[var(--radius-md)] bg-[var(--color-warning-bg)] p-[var(--card-padding)] text-sm text-[var(--color-warning)]";

export const noticeDangerClass =
  "flex flex-col gap-3 rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] p-[var(--card-padding)]";
