-- Run this in the Supabase SQL editor before using per-platform photo
-- selection/ordering.

-- Ordered subset of the item's default "Zdjęcia finalne" photo ids
-- (item_photos.id) to publish for this one listing (platform), in this
-- exact order. Null/empty means "use all final photos in their existing
-- sort_order" — the behavior every existing listing already has.
alter table marketplace_listings
  add column if not exists selected_photo_ids uuid[];
