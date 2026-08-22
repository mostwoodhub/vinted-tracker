-- Run this in the Supabase SQL editor before using manual photo reordering.

-- Photo order was purely implicit (uploaded_at) until now — no way to
-- promote a better cover shot to the front, or control which photos land
-- in OLX's first-N cutoff, without re-uploading. Backfilled from the
-- existing uploaded_at order so nothing visually shifts on first load.
alter table item_photos
  add column if not exists sort_order int not null default 0;

with ordered as (
  select id, row_number() over (
    partition by item_id, is_working_photo
    order by uploaded_at asc
  ) as rn
  from item_photos
)
update item_photos
set sort_order = ordered.rn
from ordered
where item_photos.id = ordered.id;

create index if not exists item_photos_sort_order_idx
  on item_photos(item_id, is_working_photo, sort_order);
