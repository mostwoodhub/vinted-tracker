-- Run this in the Supabase SQL editor before using OLX API publishing.

-- client_credentials (no login) only works for read-only reference data on
-- OLX's API (categories, cities) — creating/listing/deactivating adverts
-- returns "Invalid user ID in token" without a token tied to an actual
-- authorized OLX account. That requires the authorization_code flow: the
-- account owner logs into OLX once via /api/olx/authorize, and the
-- resulting refresh_token is stored here so the app can silently mint
-- fresh access tokens afterward, indefinitely (until OLX revokes it).
-- Single row, always upserted onto id=1 — there's exactly one OLX account
-- this app ever acts as.
create table if not exists olx_oauth_tokens (
  id int primary key default 1,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint olx_oauth_tokens_singleton check (id = 1)
);
