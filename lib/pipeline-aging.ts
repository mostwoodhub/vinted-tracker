import { median } from "@/lib/day-buckets";

export type PipelineStageRow = {
  status: string;
  label: string;
  threshold: number;
  count: number;
  stuckCount: number;
  medianDays: number | null;
};

// Thresholds reflect what's actually within the team's control at each
// stage vs. what's market-driven: received/photos/ai_card/ready_to_publish
// are internal handoffs that should move in days, while published is a
// listing waiting for a buyer — normal to take much longer before it's
// worth a reprice.
const STAGE_DEFS: { status: string; label: string; threshold: number }[] = [
  { status: "received", label: "Przyjęto", threshold: 2 },
  { status: "photos_uploaded", label: "Zdjęcia", threshold: 1 },
  { status: "ai_card_ready", label: "Karta AI", threshold: 5 },
  { status: "ready_to_publish", label: "Gotowe do publikacji", threshold: 5 },
  { status: "published", label: "Opublikowano", threshold: 45 },
  { status: "returned", label: "Zwrot", threshold: 3 },
];

export function computePipelineAging(
  items: { status: string; daysInStage: number }[]
): PipelineStageRow[] {
  return STAGE_DEFS.map((def) => {
    const inStage = items.filter((i) => i.status === def.status);
    const days = inStage.map((i) => i.daysInStage);
    return {
      status: def.status,
      label: def.label,
      threshold: def.threshold,
      count: inStage.length,
      stuckCount: days.filter((d) => d > def.threshold).length,
      medianDays: median(days),
    };
  }).filter((row) => row.count > 0);
}
