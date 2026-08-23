-- Run this in the Supabase SQL editor before using the Allegro API integration.

-- Tracks the real Allegro offer behind one listing_publications row (one
-- publish-via-API action = one row here, same as a manual publication).
-- allegro_status mirrors Allegro's own publication.status ("ACTIVE",
-- "INACTIVE", "ENDED", ...); allegro_last_error holds the most recent
-- failed attempt's message so it's visible without digging through server
-- logs.
alter table listing_publications
  add column if not exists allegro_offer_id text,
  add column if not exists allegro_url text,
  add column if not exists allegro_status text,
  add column if not exists allegro_synced_at timestamptz,
  add column if not exists allegro_last_error text;

create index if not exists listing_publications_allegro_offer_id_idx
  on listing_publications(allegro_offer_id);
