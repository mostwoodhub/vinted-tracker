import Link from "next/link";
import { buttonPrimaryClass, headingClass, mutedTextClass, pageWrapClass } from "@/lib/ui-classes";

export default function NotFound() {
  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
        <h1 className={headingClass}>Nie znaleziono strony</h1>
        <p className={`text-sm ${mutedTextClass}`}>
          Strona, której szukasz, nie istnieje albo została przeniesiona.
        </p>
        <Link href="/" className={buttonPrimaryClass}>
          Strona główna
        </Link>
      </div>
    </div>
  );
}
