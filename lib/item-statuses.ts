export const ITEM_STATUSES = [
  "received",
  "photos_uploaded",
  "ai_card_ready",
  "ready_to_publish",
  "published",
  "returned",
  "sold",
] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number];
