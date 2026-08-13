import { getDistinctValues } from "@/lib/distinct-values";
import { IntakeForm } from "./IntakeForm";

export default async function IntakePage() {
  const [brands, sizes, batchLabels] = await Promise.all([
    getDistinctValues("items", "brand"),
    getDistinctValues("items", "size"),
    getDistinctValues("batches", "label"),
  ]);

  return (
    <IntakeForm brands={brands} sizes={sizes} batchLabels={batchLabels} />
  );
}
