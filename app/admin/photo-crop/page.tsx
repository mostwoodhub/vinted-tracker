import { redirect } from "next/navigation";
import { getCurrentEmployee, getEffectiveRoles } from "@/lib/auth";
import { headingClass, mutedTextClass, pageWrapClass } from "@/lib/ui-classes";
import { PhotoCropTool } from "./PhotoCropTool";

export default async function PhotoCropPage() {
  const employee = await getCurrentEmployee();
  const roles = getEffectiveRoles(employee);

  if (!roles.has("admin")) {
    redirect("/warehouse");
  }

  return (
    <div className={pageWrapClass}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-[var(--space-lg)] px-6 py-12">
        <h1 className={headingClass}>Przytnij zdjęcia</h1>
        <p className={`text-sm ${mutedTextClass}`}>
          Wgraj kilkanaście zdjęć, ustaw o ile procent przyciąć każdą
          krawędź, a potem zapisz wszystkie od razu — obrobione pliki
          trafiają na twój komputer (nie do systemu).
        </p>
        <PhotoCropTool />
      </div>
    </div>
  );
}
