export type DayBucket = { label: string; min: number; max: number | null; count: number };

const DAY_BUCKET_DEFS: { label: string; min: number; max: number | null }[] = [
  { label: "0–30 dni", min: 0, max: 30 },
  { label: "30–60 dni", min: 30, max: 60 },
  { label: "60–90 dni", min: 60, max: 90 },
  { label: "90+ dni", min: 90, max: null },
];

export function bucketByDays(daysList: number[]): DayBucket[] {
  const buckets = DAY_BUCKET_DEFS.map((d) => ({ ...d, count: 0 }));
  for (const days of daysList) {
    const bucket =
      buckets.find((b) => days >= b.min && (b.max === null || days < b.max)) ??
      buckets[buckets.length - 1];
    bucket.count += 1;
  }
  return buckets;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}
