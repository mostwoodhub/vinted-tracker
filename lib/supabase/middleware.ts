import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

// /reset-password must stay public: the recovery link's session lives only
// in the URL hash, processed client-side — the server-side check below would
// otherwise redirect the user to /login before that client code ever runs.
const PUBLIC_PATHS = ["/login", "/reset-password"];

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

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // getUser() always makes a live call to Supabase's auth server, so on a
  // flaky mobile connection a transient network hiccup looks identical to
  // "no session" — this was force-logging out real, still-valid sessions on
  // basically any page load. Only a genuine missing/invalid session should
  // redirect to /login; a retryable fetch error should just let the request
  // through with whatever session state the request already carried.
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
