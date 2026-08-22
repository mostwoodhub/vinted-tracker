import { NextRequest, NextResponse } from "next/server";
import { checkRole } from "@/lib/auth";
import { exchangeOlxAuthorizationCode } from "@/lib/olx-client";

const STATE_COOKIE = "olx_oauth_state";

export async function GET(request: NextRequest) {
  const access = await checkRole("admin");
  if (!access.ok) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;

  const resultUrl = new URL("/admin/olx", request.url);

  if (!code || !state || !expectedState || state !== expectedState) {
    resultUrl.searchParams.set("error", "Nieprawidłowa odpowiedź OLX (brak kodu lub state się nie zgadza)");
    const response = NextResponse.redirect(resultUrl);
    response.cookies.delete(STATE_COOKIE);
    return response;
  }

  const result = await exchangeOlxAuthorizationCode(code);
  if (!result.ok) {
    resultUrl.searchParams.set("error", result.error);
  } else {
    resultUrl.searchParams.set("connected", "1");
  }

  const response = NextResponse.redirect(resultUrl);
  response.cookies.delete(STATE_COOKIE);
  return response;
}
