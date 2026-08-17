import { getDistinctValues } from "@/lib/distinct-values";
import { suggestNextLegacyNumber } from "@/lib/next-legacy-number";
import { IntakeForm } from "./IntakeForm";

export default async function IntakePage() {
  const [brands, sizes, batchLabels, suggestedLegacyNumber] = await Promise.all([
    getDistinctValues("items", "brand"),
    getDistinctValues("items", "size"),
    getDistinctValues("batches", "label"),
    suggestNextLegacyNumber(),
  ]);

  return (
    <IntakeForm
      brands={brands}
      sizes={sizes}
      batchLabels={batchLabels}
      suggestedLegacyNumber={suggestedLegacyNumber}
    />
  );
}
