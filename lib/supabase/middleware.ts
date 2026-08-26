import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

// /reset-password must stay public: the recovery link's session lives only
// in the URL hash, processed client-side — the server-side check below would
// otherwise redirect the user to /login before that client code ever runs.
//
// /manifest.webmanifest must stay public too: Android's install/WebAPK
// check fetches it directly and expects real JSON back — a redirect to
// /login instead (which is what an unauthenticated request got before
// this) makes Chrome silently fail the installability check and fall
// back to a plain "Add to Home screen" shortcut instead of a real,
// standalone-mode app install.
const PUBLIC_PATHS = ["/login", "/reset-password", "/manifest.webmanifest"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() always makes a live call to Supabase's auth server, so on a
  // flaky mobile connection this request would otherwise sit waiting on
  // that round trip with no bound — the browser eventually gives up on its
  // own and shows its own generic "page couldn't load" error, never even
  // reaching our redirect-vs-pass-through logic below. Racing it against a
  // timeout means a slow network gets a fast, deliberate fallback instead.
  const AUTH_CHECK_TIMEOUT_MS = 5000;
  const result = await Promise.race([
    supabase.auth.getUser(),
    new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), AUTH_CHECK_TIMEOUT_MS)
    ),
  ]);

  if (result === "timeout") {
    return supabaseResponse;
  }

  const {
    data: { user },
    error,
  } = result;

  // Distinct from the timeout above: getUser() returned, but with a
  // network-flavored error rather than a clean "no session" — on a flaky
  // mobile connection that looked identical to "no session" and was
  // force-logging out real, still-valid sessions on basically any page
  // load. Only a genuine missing/invalid session should redirect to
  // /login; a retryable fetch error should just let the request through.
  if (error && isAuthRetryableFetchError(error)) {
    return supabaseResponse;
  }

  const isPublicPath = PUBLIC_PATHS.includes(request.nextUrl.pathname);

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (
    user &&
    (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/")
  ) {
    // Home page is Sprzedaż — also covers "/" directly (no app/page.tsx
    // exists, so without this an authenticated visit to the bare domain
    // would 404 instead of landing anywhere useful).
    const url = request.nextUrl.clone();
    url.pathname = "/sales";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
