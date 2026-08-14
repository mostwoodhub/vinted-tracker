-- Run this in the Supabase SQL editor before using the new features
-- (multi-background photo sets + per-account listing publications).

-- 1) Photo sets: group "final" (listing) photos into 2-3 variants — e.g. shot
--    on different backgrounds — so the same shoes can be published on
--    several accounts without using visually identical photos everywhere.
--    A set can optionally be earmarked for one specific selling account.
create table if not exists item_photo_sets (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  account_name text,
  label text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Existing final photos (photo_set_id null) keep showing under an "Ogólne"
-- (unassigned) bucket in the UI — nothing breaks for already-uploaded items.
alter table item_photos
  add column if not exists photo_set_id uuid references item_photo_sets(id) on delete cascade;

-- 2) Listing publications: which (platform, account) combinations a listing
--    is actually live on right now. One marketplace_listings row (one
--    platform's draft title/description) can have several active
--    publications — e.g. the same Vinted draft posted under both "Anton"
--    and "Żona" accounts. Kept even after removal (removed_at set) so
--    there's a history of who/where it was ever posted.
create table if not exists listing_publications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references marketplace_listings(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  account_name text not null,
  photo_set_id uuid references item_photo_sets(id) on delete set null,
  published_at timestamptz not null default now(),
  removed_at timestamptz
);

create index if not exists listing_publications_item_id_idx on listing_publications(item_id);
create index if not exists listing_publications_listing_id_idx on listing_publications(listing_id);
create index if not exists item_photo_sets_item_id_idx on item_photo_sets(item_id);
create index if not exists item_photos_photo_set_id_idx on item_photos(photo_set_id);
