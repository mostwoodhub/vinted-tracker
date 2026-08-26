import { mutedTextClass, pageWrapClass } from "@/lib/ui-classes";

// Shown while a page segment's data (the Promise.all fetches most pages
// here do) is still loading — without this, a slow connection just showed
// a blank white page with no indication anything was happening.
export default function Loading() {
  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]"
          role="status"
          aria-label="Ładowanie"
        />
        <p className={`text-sm ${mutedTextClass}`}>Ładowanie…</p>
      </div>
    </div>
  );
}
