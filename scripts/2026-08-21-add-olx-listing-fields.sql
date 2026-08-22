-- Run this in the Supabase SQL editor before using the OLX API integration.

-- Tracks the real OLX advert behind one listing_publications row (one
-- publish-via-API action = one row here, same as a manual publication).
-- olx_status mirrors OLX's own advert status ("active", "removed_by_user",
-- "outdated", ...); olx_last_error holds the most recent failed attempt's
-- message so it's visible without digging through server logs.
alter table listing_publications
  add column if not exists olx_advert_id bigint,
  add column if not exists olx_url text,
  add column if not exists olx_status text,
  add column if not exists olx_synced_at timestamptz,
  add column if not exists olx_last_error text;

create index if not exists listing_publications_olx_advert_id_idx
  on listing_publications(olx_advert_id);
