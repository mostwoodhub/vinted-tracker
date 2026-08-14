import { createBrowserClient } from "@supabase/ssr";

// Browser-side client — needed for anything that must run purely client-side,
// like the password recovery flow (Supabase puts the recovery token in the
// URL hash fragment, which only ever reaches the browser, never the server).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
