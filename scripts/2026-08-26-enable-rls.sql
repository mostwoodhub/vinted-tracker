-- Run this in the Supabase SQL editor.

-- Every table here was reachable with zero database-level protection —
-- the app relies entirely on the service-role key (supabaseAdmin, used in
-- every server action/route) plus application-level checkRole() checks.
-- The service role bypasses RLS by design, so enabling it here with no
-- policies changes nothing about how the app itself behaves today; it
-- only closes the gap for a future mistake — a component that ends up
-- querying one of these tables with the anon/authenticated client (the
-- one currently used only for auth.getUser() in lib/auth.ts, login, and
-- password reset) would get zero rows instead of a real leak.
--
-- No policies are added on purpose: nothing in this app is meant to read
-- or write these tables except supabaseAdmin, which doesn't need one.
-- If a genuine client-side use case ever comes up, add a scoped policy
-- for it then rather than leaving RLS off in the meantime.

alter table items enable row level security;
alter table sales enable row level security;
alter table batches enable row level security;
alter table expenses enable row level security;
alter table employees enable row level security;
alter table item_photos enable row level security;
alter table item_photo_sets enable row level security;
alter table item_status_log enable row level security;
alter table marketplace_listings enable row level security;
alter table listing_publications enable row level security;
alter table sales_accounts_archive enable row level security;
alter table sales_profiles_archive enable row level security;
alter table auth_login_log enable row level security;
alter table allegro_oauth_tokens enable row level security;
alter table olx_oauth_tokens enable row level security;
