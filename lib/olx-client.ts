import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

// OLX Partner API — endpoints confirmed against a live account (Client ID
// 203137, "AntVntOlx") on 2026-08-21. OLX's own developer docs are a
// JS-rendered SPA that doesn't expose its content to a plain fetch, so
// these were verified directly against the real API rather than scraped
// from the docs page.
const BASE = "https://www.olx.pl";
const HEADERS = { Version: "2.0", "Content-Type": "application/json" };

// Fixed for this business — the warehouse/pickup location never changes.
// Discovered by paginating GET /api/partner/cities (no name/search filter
// is honored by the endpoint) until an exact "Rzeszów" match turned up.
export const OLX_CITY_ID = 15241;

export const OLX_CONTACT = { name: "Butmos", phone: "730358095" };
export const OLX_ADVERTISER_TYPE = "business" as const;

// Vercel production domain — OLX's own servers redirect here after the
// account owner approves the app, so this must be publicly reachable (not
// localhost) and must exactly match what's registered as this app's
// callback URI on developer.olx.pl.
export const OLX_REDIRECT_URI = "https://vinted-tracker.vercel.app/api/olx/callback";

export type OlxAuthResult =
  | { ok: true; accessToken: string }
  | { ok: false; error: string };

// client_credentials (no login) only authenticates the *app* — verified
// live that it works for read-only reference data (categories, cities) but
// OLX rejects anything touching actual adverts with "Invalid user ID in
// token". Acting as the seller requires a token from the authorization_code
// flow instead (see buildOlxAuthorizeUrl/exchangeOlxAuthorizationCode),
// whose refresh_token is stored in olx_oauth_tokens and exchanged for a
// fresh access token on every call here — no in-memory caching, since
// serverless invocations don't share memory and call volume is low enough
// that the extra round trip doesn't matter.
export async function getOlxToken(): Promise<OlxAuthResult> {
  const clientId = process.env.OLX_CLIENT_ID;
  const clientSecret = process.env.OLX_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, error: "Brak OLX_CLIENT_ID / OLX_CLIENT_SECRET w konfiguracji" };
  }

  const { data: stored } = await supabaseAdmin
    .from("olx_oauth_tokens")
    .select("refresh_token")
    .eq("id", 1)
    .maybeSingle();
  if (!stored) {
    return {
      ok: false,
      error: "Konto OLX nie jest jeszcze połączone — przejdź do /admin/olx i kliknij „Połącz z OLX”.",
    };
  }

  const result = await requestOlxToken({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: stored.refresh_token,
  });
  if (!result.ok) return result;

  await storeOlxTokens(result);
  return { ok: true, accessToken: result.accessToken };
}

// The one-time consent screen URL — the account owner (Butmos) opens this,
// logs into OLX if needed, and approves the app. `state` is a CSRF token
// the caller generates and must verify matches on the callback.
export function buildOlxAuthorizeUrl(state: string): string {
  const url = new URL(`${BASE}/oauth/authorize`);
  url.searchParams.set("client_id", process.env.OLX_CLIENT_ID ?? "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "read write v2");
  url.searchParams.set("redirect_uri", OLX_REDIRECT_URI);
  url.searchParams.set("state", state);
  return url.toString();
}

type OlxTokenExchangeResult =
  | { ok: true; accessToken: string; refreshToken: string; expiresIn: number }
  | { ok: false; error: string };

async function requestOlxToken(body: Record<string, string>): Promise<OlxTokenExchangeResult> {
  const res = await fetch(`${BASE}/api/open/oauth/token/`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) {
    return { ok: false, error: data?.error_description ?? data?.error ?? `Błąd autoryzacji OLX (${res.status})` };
  }
  return {
    ok: true,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

async function storeOlxTokens(tokens: { accessToken: string; refreshToken: string; expiresIn: number }) {
  await supabaseAdmin.from("olx_oauth_tokens").upsert({
    id: 1,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
}

// Called once, from the /api/olx/callback route, right after the account
// owner approves the app on OLX's consent screen.
export async function exchangeOlxAuthorizationCode(code: string): Promise<OlxResult<true>> {
  const clientId = process.env.OLX_CLIENT_ID;
  const clientSecret = process.env.OLX_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, error: "Brak OLX_CLIENT_ID / OLX_CLIENT_SECRET w konfiguracji" };
  }

  const result = await requestOlxToken({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: OLX_REDIRECT_URI,
  });
  if (!result.ok) return result;

  await storeOlxTokens(result);
  return { ok: true, data: true };
}

export async function getOlxConnectionInfo(): Promise<{ connected: boolean; updatedAt: string | null }> {
  const { data } = await supabaseAdmin.from("olx_oauth_tokens").select("updated_at").eq("id", 1).maybeSingle();
  return { connected: Boolean(data), updatedAt: data?.updated_at ?? null };
}

function authedHeaders(token: string) {
  return { ...HEADERS, Authorization: `Bearer ${token}` };
}

export type OlxAttribute = { code: string; value?: string; values?: string[] };

export type OlxAdvertPayload = {
  title: string;
  description: string;
  categoryId: string;
  price: number;
  externalId: string;
  images: string[];
  attributes: OlxAttribute[];
};

export type OlxAdvert = {
  id: number;
  status: string;
  url: string;
};

export type OlxResult<T> = { ok: true; data: T } | { ok: false; error: string };

function olxErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object" && "error" in data) {
    const err = (data as { error: unknown }).error;
    if (typeof err === "string") return err;
    if (err && typeof err === "object" && "detail" in err) {
      return String((err as { detail: unknown }).detail);
    }
  }
  return `Błąd OLX (${status})`;
}

// One category suggestion per item, not a fixed constant — OLX's own
// suggestion endpoint reads the title text and correctly tells sneakers
// apart from heels/boots/wellingtons (verified: "Nike Air Max 90 buty
// sportowe" → Obuwie sportowe męskie; a title without "sportowe" routes
// elsewhere), which this business's mixed inventory actually needs.
export async function suggestOlxCategory(
  token: string,
  title: string
): Promise<OlxResult<string>> {
  const url = new URL(`${BASE}/api/partner/categories/suggestion`);
  url.searchParams.set("q", title);
  const res = await fetch(url, { headers: authedHeaders(token) });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: olxErrorMessage(data, res.status) };

  const first = data?.data?.[0];
  if (!first?.id) return { ok: false, error: "OLX nie zaproponował żadnej kategorii dla tego tytułu" };
  return { ok: true, data: String(first.id) };
}

export type OlxCategoryAttribute = {
  code: string;
  required: boolean;
  values: { code: string; label: string }[];
};

// The inventory spans sneakers, heels, boots, kids' shoes, wellies... —
// each can resolve to a different OLX category with its own attribute set
// (a kids category's size range isn't the adult 36-50 seen for sport
// shoes, for instance). Fetched live per publish rather than assuming one
// fixed schema, so buildOlxAttributes can validate against what this
// specific category actually accepts instead of guessing.
export async function getOlxCategoryAttributes(
  token: string,
  categoryId: string
): Promise<OlxResult<OlxCategoryAttribute[]>> {
  const res = await fetch(`${BASE}/api/partner/categories/${categoryId}/attributes`, {
    headers: authedHeaders(token),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: olxErrorMessage(data, res.status) };

  const attrs: OlxCategoryAttribute[] = (data?.data ?? []).map(
    (a: { code: string; validation?: { required?: boolean }; values?: { code: string; label: string }[] }) => ({
      code: a.code,
      required: a.validation?.required ?? false,
      values: a.values ?? [],
    })
  );
  return { ok: true, data: attrs };
}

// photos_limit varies by category (not a flat 8 everywhere) — fetched live
// per publish alongside the category's attributes, so publishOlxAdvert can
// cap the images it sends instead of letting OLX reject the whole advert
// for having too many.
export async function getOlxCategoryPhotosLimit(
  token: string,
  categoryId: string
): Promise<OlxResult<number>> {
  const res = await fetch(`${BASE}/api/partner/categories/${categoryId}`, {
    headers: authedHeaders(token),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: olxErrorMessage(data, res.status) };
  return { ok: true, data: data?.data?.photos_limit ?? 8 };
}

export async function createOlxAdvert(
  token: string,
  payload: OlxAdvertPayload
): Promise<OlxResult<OlxAdvert>> {
  const res = await fetch(`${BASE}/api/partner/adverts`, {
    method: "POST",
    headers: authedHeaders(token),
    body: JSON.stringify({
      title: payload.title,
      description: payload.description,
      category_id: payload.categoryId,
      advertiser_type: OLX_ADVERTISER_TYPE,
      contact: OLX_CONTACT,
      price: { value: payload.price, currency: "PLN", negotiable: false, trade: false, budget: false },
      location: { city_id: OLX_CITY_ID, district_id: null },
      attributes: payload.attributes,
      images: payload.images.map((url) => ({ url })),
      external_id: payload.externalId,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: olxErrorMessage(data, res.status) };
  return { ok: true, data: { id: data.id, status: data.status, url: data.url } };
}

// is_success distinguishes "sold" from "took it down for another reason" —
// OLX surfaces this in the seller's own stats, so it's worth getting right
// rather than always passing true.
export async function deactivateOlxAdvert(
  token: string,
  advertId: number,
  isSuccess: boolean
): Promise<OlxResult<true>> {
  const res = await fetch(`${BASE}/api/partner/adverts/${advertId}/commands`, {
    method: "POST",
    headers: authedHeaders(token),
    body: JSON.stringify({ command: "deactivate", is_success: isSuccess }),
  });

  if (res.status === 204) return { ok: true, data: true };
  const data = await res.json().catch(() => null);
  return { ok: false, error: olxErrorMessage(data, res.status) };
}

export async function getOlxAdvert(
  token: string,
  advertId: number
): Promise<OlxResult<{ status: string; url: string }>> {
  const res = await fetch(`${BASE}/api/partner/adverts/${advertId}`, {
    headers: authedHeaders(token),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: olxErrorMessage(data, res.status) };
  return { ok: true, data: { status: data.status, url: data.url } };
}

export async function getOlxAdvertStatistics(
  token: string,
  advertId: number
): Promise<OlxResult<{ advertViews: number; phoneViews: number; usersObserving: number }>> {
  const res = await fetch(`${BASE}/api/partner/adverts/${advertId}/statistics`, {
    headers: authedHeaders(token),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: olxErrorMessage(data, res.status) };
  return {
    ok: true,
    data: {
      advertViews: data.advert_views ?? 0,
      phoneViews: data.phone_views ?? 0,
      usersObserving: data.users_observing ?? 0,
    },
  };
}

// OLX's fixed fashion-brand code list (confirmed live on 2026-08-21, via
// the "Obuwie sportowe" category — shared across fashion categories).
// Unmatched brands just omit the attribute since it's optional everywhere
// observed so far.
const OLX_BRAND_CODES = new Set([
  "4f", "aape", "abercrombie", "adidas", "adidasoriginals", "aloyoga", "amiparis", "amisu",
  "anta", "arcteryx", "asics", "asos", "atmosphere", "bape", "barbie", "bershka", "bigstar",
  "bonobo", "bonprix", "boohoo", "burberry", "butik", "bytom", "ca", "calvin", "calzedonia",
  "camaïeu", "carhartt", "champion", "coccodrillo", "columbia", "converse", "cos", "crocs",
  "cropp", "cubus", "decathlon", "denim", "denim co", "descente", "desigual", "dickies",
  "diesel", "disney", "diverse", "dorothy perkins", "drmartens", "esmara", "esprit", "etam",
  "evisu", "fearofgod", "ff", "fila", "forever21", "gstar", "gap", "george", "geox", "guess",
  "hellokitty", "heronpreston", "hm", "hoka", "hollister", "house", "hugoboss", "ikks",
  "jackjones", "jennyfer", "jordan", "kaporal", "kappa", "kappahl", "kenzo", "kiabi", "kith",
  "lacoste", "lee", "lefties", "levistrauss", "levis", "lining", "liujo", "lupilu", "mango",
  "marceloburlon", "marks", "marvel", "massimo", "mayoral", "medicine", "mexx", "miharayasuhiro",
  "missguided", "mlb", "mohito", "monoprix", "morgan", "nameit", "napapijri", "nautica",
  "newbalance", "newcollection", "newlook", "newyorker", "next", "nike", "nikeair", "nolabel",
  "oasis", "ochnik", "offwhite", "okaïdi", "onitsukatiger", "onlysons", "only", "originalmarines",
  "orsay", "ovs", "palace", "palmangels", "pandora", "parfois", "pepco", "pepejeans", "pimkie",
  "prettylittlething", "primark", "promod", "pullbear", "puma", "quechua", "quiksilver",
  "ralphlauren", "reebok", "reserved", "rickowens", "ripndip", "riverisland", "roxy", "salomon",
  "saucony", "shein", "sinsay", "sisley", "solar", "s.oliver", "springfield", "starwars",
  "stoneisland", "stradivarius", "street one", "stussy", "superdry", "supreme", "tamaris",
  "tatuum", "tedbaker", "terranova", "tex", "tezenis", "thenorthface", "thrasher", "timberland",
  "tomtailor", "tommy", "topsecret", "topshop", "tu", "underarmour", "uniqlo", "unitedcolors",
  "urbanoutfitters", "vans", "veromoda", "vlone", "wrangler", "wtaps", "y3", "yeezy", "zara",
]);

function mapConditionToOlxState(condition: string | null): "used" | "new" {
  return condition === "Nowe" ? "new" : "used";
}

// "36,5" (this app's format) → "36-5" (OLX's format) — only used as a
// candidate; buildOlxAttributes still checks it against the category's own
// live `size.values` before including it, since a non-adult category can
// use an entirely different size range/format.
function mapSizeToOlxCode(size: string | null): string | null {
  if (!size) return null;
  const normalized = size.trim().replace(",", "-");
  return normalized || null;
}

function mapBrandToOlxCode(brand: string | null): string | null {
  if (!brand) return null;
  const normalized = brand.trim().toLowerCase().replace(/[^a-z0-9. ]/g, "");
  return OLX_BRAND_CODES.has(normalized) ? normalized : null;
}

// Builds attributes from the category's own live schema (see
// getOlxCategoryAttributes) rather than assuming every category looks like
// "Obuwie sportowe" — a required attribute this function can't confidently
// map is a hard failure (better than submitting a value OLX will reject, or
// worse, one it silently accepts but is wrong), while an optional one it
// can't map is just omitted.
export function buildOlxAttributes(
  categoryAttributes: OlxCategoryAttribute[],
  item: { condition: string | null; size: string | null; brand: string | null }
): OlxResult<OlxAttribute[]> {
  const attributes: OlxAttribute[] = [];

  for (const attr of categoryAttributes) {
    let value: string | null = null;

    if (attr.code === "state") {
      const candidate = mapConditionToOlxState(item.condition);
      value = attr.values.some((v) => v.code === candidate) ? candidate : null;
    } else if (attr.code === "size") {
      const candidate = mapSizeToOlxCode(item.size);
      value = candidate && attr.values.some((v) => v.code === candidate) ? candidate : null;
      if (!value && attr.values.some((v) => v.code === "others")) value = "others";
    } else if (attr.code === "fashionbrand" || attr.code === "brand") {
      const candidate = mapBrandToOlxCode(item.brand);
      value = candidate && attr.values.some((v) => v.code === candidate) ? candidate : null;
    }

    if (value) {
      attributes.push({ code: attr.code, value });
    } else if (attr.required) {
      return {
        ok: false,
        error: `Nie udało się dopasować wymaganego atrybutu OLX „${attr.code}” dla tego towaru`,
      };
    }
  }

  return { ok: true, data: attributes };
}
