import { getDistinctValues } from "@/lib/distinct-values";
import { IntakeForm } from "../intake/IntakeForm";

export default async function WarehouseIntakePage() {
  const [brands, sizes, batchLabels] = await Promise.all([
    getDistinctValues("items", "brand"),
    getDistinctValues("items", "size"),
    getDistinctValues("batches", "label"),
  ]);

  return (
    <IntakeForm
      brands={brands}
      sizes={sizes}
      batchLabels={batchLabels}
      heading="Przyjęcie towaru (magazyn)"
      showLegacyNumberField
    />
  );
}
