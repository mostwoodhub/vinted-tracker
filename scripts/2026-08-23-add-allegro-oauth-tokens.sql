-- Run this in the Supabase SQL editor before using Allegro API publishing.

-- Allegro's OAuth Device Flow: the account owner opens a URL and approves
-- access once (via /admin/allegro), and the resulting refresh_token is
-- stored here so the app can silently mint fresh access tokens afterward,
-- indefinitely (until Allegro revokes it). No redirect_uri needed, unlike
-- OLX's authorization_code flow.
-- Single row, always upserted onto id=1 — there's exactly one Allegro
-- account this app ever acts as.
create table if not exists allegro_oauth_tokens (
  id int primary key default 1,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint allegro_oauth_tokens_singleton check (id = 1)
);
