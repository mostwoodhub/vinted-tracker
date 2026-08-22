import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { checkRole } from "@/lib/auth";
import { buildOlxAuthorizeUrl } from "@/lib/olx-client";

const STATE_COOKIE = "olx_oauth_state";

// Kicks off the one-time OLX account connection (see olx-client.ts's
// getOlxToken comment for why client_credentials alone isn't enough). The
// state cookie is verified against what OLX echoes back to
// /api/olx/callback, so a request forged against the callback URL directly
// can't complete a connection.
export async function GET() {
  const access = await checkRole("admin");
  if (!access.ok) {
    return new NextResponse(access.error, { status: 401 });
  }

  const state = randomBytes(24).toString("hex");
  const response = NextResponse.redirect(buildOlxAuthorizeUrl(state));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 300,
    path: "/api/olx",
  });
  return response;
}
