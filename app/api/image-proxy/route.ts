import { NextRequest, NextResponse } from "next/server";
import { checkRole } from "@/lib/auth";

// Sale photo/label URLs can point at either the current Supabase Storage
// project or, for rows migrated from the old sales-tracking system, the
// legacy project they were never re-uploaded from. Browser-side canvas
// reads (used to build the printable PDF) need CORS-clean bytes, which
// neither host reliably provides directly — so this route fetches them
// server-side, where CORS doesn't apply, and streams the bytes back
// same-origin. Restricted to *.supabase.co (plus whatever the current
// project's URL host is, in case it's ever not on that domain) to avoid
// becoming an open URL-fetching proxy.
const LEGACY_SUPABASE_HOST = "gsklmtjnrzvkbghhbvbb.supabase.co";
const UPSTREAM_TIMEOUT_MS = 15_000;

function isAllowedHost(host: string): boolean {
  if (host === LEGACY_SUPABASE_HOST || host.endsWith(".supabase.co")) return true;
  const currentUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (currentUrl) {
    try {
      if (host === new URL(currentUrl).host) return true;
    } catch {
      // ignore malformed env value
    }
  }
  return false;
}

export async function GET(request: NextRequest) {
  const access = await checkRole("admin");
  if (!access.ok) {
    return new NextResponse(access.error, { status: 401 });
  }

  const urlParam = request.nextUrl.searchParams.get("url");
  if (!urlParam) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(urlParam);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  if (target.protocol !== "https:" || !isAllowedHost(target.host)) {
    console.error(`[image-proxy] Host not allowed: ${target.host}`);
    return new NextResponse("Host not allowed", { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`[image-proxy] Upstream fetch failed for ${target.toString()}:`, err);
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return new NextResponse(timedOut ? "Upstream timeout" : "Upstream fetch failed", {
      status: 502,
    });
  }

  if (!upstream.ok || !upstream.body) {
    console.error(
      `[image-proxy] Upstream error for ${target.toString()}: ${upstream.status} ${upstream.statusText}`
    );
    return new NextResponse(`Upstream error: ${upstream.status} ${upstream.statusText}`, {
      status: upstream.status || 502,
    });
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";

  return new NextResponse(upstream.body, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
