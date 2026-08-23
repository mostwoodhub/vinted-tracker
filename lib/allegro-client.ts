import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Allegro REST API — endpoints confirmed against a live account (Client ID
// 58ac80961a0d4fc3923a4f378da0e433, "Vinted Device Flow") on 2026-08-23.
const AUTH_BASE = "https://allegro.pl";
const API_BASE = "https://api.allegro.pl";
const API_ACCEPT = "application/vnd.allegro.public.v1+json";
// Registered via apps.developer.allegro.pl/user-agent — calls without a
// registered User-Agent risk getting the API key blocked.
const USER_AGENT = "Vinted-Device-Flow/1.0.0 (+https://vinted-tracker-khaki.vercel.app)";

// Fixed for this business — the warehouse/pickup location never changes.
// Matches the seller's existing return-policy address on file.
export const ALLEGRO_LOCATION = {
  countryCode: "PL",
  province: "PODKARPACKIE",
  city: "Rzeszów",
  postCode: "35-326",
};

// Discovered live via GET /sale/shipping-rates (the seller's own custom
// template, not one of Allegro's managed "One Fulfillment" rates) and
// GET /after-sales-service-conditions/return-policies|implied-warranties —
// these already existed on the account from selling on Allegro before, so
// they're used as-is rather than created by this app.
export const ALLEGRO_SHIPPING_RATES_ID = "1c98ac43-5da2-4ebd-845f-4b6767443664";
export const ALLEGRO_RETURN_POLICY_ID = "4379a3c1-bb38-4c62-8f36-a834bc5d5f77";
export const ALLEGRO_IMPLIED_WARRANTY_ID = "4e7bc7f9-1998-4d7b-8aa3-ad97662a4a28";

// Not exposed per-category the way OLX's photos_limit is — this is
// Allegro's commonly documented flat cap, not verified against a live
// per-category endpoint.
export const ALLEGRO_MAX_PHOTOS = 16;

export type AllegroResult<T> = { ok: true; data: T } | { ok: false; error: string };

function authedHeaders(token: string, withBody: boolean) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: API_ACCEPT,
    "User-Agent": USER_AGENT,
  };
  if (withBody) headers["Content-Type"] = API_ACCEPT;
  return headers;
}

function allegroErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object" && "errors" in data) {
    const errors = (data as { errors: unknown }).errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0] as { userMessage?: string; message?: string };
      return first.userMessage ?? first.message ?? `Błąd Allegro (${status})`;
    }
  }
  return `Błąd Allegro (${status})`;
}

// --- Device Flow auth ---------------------------------------------------

export type AllegroDeviceFlowStart = {
  deviceCode: string;
  userCode: string;
  verificationUriComplete: string;
  interval: number;
  expiresIn: number;
};

// The one-time consent step — the account owner opens verificationUriComplete
// (no redirect_uri/callback URL needed, unlike OLX's authorization_code
// flow), logs into Allegro if needed, and approves. deviceCode is then
// exchanged via exchangeAllegroDeviceCode, which the caller retries after
// the account owner confirms they've approved it (no server-side polling
// infrastructure — this app has low enough call volume that a manual
// "I've approved it, continue" click is simpler than a background poller).
export async function startAllegroDeviceFlow(): Promise<AllegroResult<AllegroDeviceFlowStart>> {
  const clientId = process.env.ALLEGRO_CLIENT_ID;
  const clientSecret = process.env.ALLEGRO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, error: "Brak ALLEGRO_CLIENT_ID / ALLEGRO_CLIENT_SECRET w konfiguracji" };
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${AUTH_BASE}/auth/oauth/device`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({ client_id: clientId }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.device_code) {
    return { ok: false, error: allegroErrorMessage(data, res.status) };
  }

  return {
    ok: true,
    data: {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUriComplete: data.verification_uri_complete,
      interval: data.interval ?? 5,
      expiresIn: data.expires_in ?? 600,
    },
  };
}

type AllegroTokenExchangeResult =
  | { ok: true; accessToken: string; refreshToken: string; expiresIn: number }
  | { ok: false; pending: true }
  | { ok: false; error: string };

async function requestAllegroToken(body: Record<string, string>): Promise<AllegroTokenExchangeResult> {
  const clientId = process.env.ALLEGRO_CLIENT_ID;
  const clientSecret = process.env.ALLEGRO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, error: "Brak ALLEGRO_CLIENT_ID / ALLEGRO_CLIENT_SECRET w konfiguracji" };
  }
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${AUTH_BASE}/auth/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (data?.error === "authorization_pending") return { ok: false, pending: true };
    return { ok: false, error: data?.error_description ?? data?.error ?? `Błąd autoryzacji Allegro (${res.status})` };
  }
  return { ok: true, accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
}

async function storeAllegroTokens(tokens: { accessToken: string; refreshToken: string; expiresIn: number }) {
  await supabaseAdmin.from("allegro_oauth_tokens").upsert({
    id: 1,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
}

// Called from /admin/allegro's "Sprawdziłem, kontynuuj" button — a plain
// "pending" result (not yet approved) is distinct from a real error so the
// page can just ask the user to click again rather than showing a scary
// failure.
export async function exchangeAllegroDeviceCode(
  deviceCode: string
): Promise<AllegroResult<true> | { ok: false; pending: true }> {
  const result = await requestAllegroToken({
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    device_code: deviceCode,
  });
  if (!result.ok) return result;

  await storeAllegroTokens(result);
  return { ok: true, data: true };
}

export type AllegroAuthResult = { ok: true; accessToken: string } | { ok: false; error: string };

// Mirrors getOlxToken: no in-memory caching, a fresh access_token is minted
// from the stored refresh_token on every call — serverless invocations
// don't share memory and this app's call volume is low enough that the
// extra round trip doesn't matter.
export async function getAllegroToken(): Promise<AllegroAuthResult> {
  const { data: stored } = await supabaseAdmin
    .from("allegro_oauth_tokens")
    .select("refresh_token")
    .eq("id", 1)
    .maybeSingle();
  if (!stored) {
    return {
      ok: false,
      error: "Konto Allegro nie jest jeszcze połączone — przejdź do /admin/allegro i kliknij „Połącz z Allegro”.",
    };
  }

  const result = await requestAllegroToken({
    grant_type: "refresh_token",
    refresh_token: stored.refresh_token,
  });
  if (!result.ok) {
    if ("pending" in result) return { ok: false, error: "Autoryzacja Allegro jeszcze nie zatwierdzona" };
    return result;
  }

  await storeAllegroTokens(result);
  return { ok: true, accessToken: result.accessToken };
}

export async function getAllegroConnectionInfo(): Promise<{ connected: boolean; updatedAt: string | null }> {
  const { data } = await supabaseAdmin.from("allegro_oauth_tokens").select("updated_at").eq("id", 1).maybeSingle();
  return { connected: Boolean(data), updatedAt: data?.updated_at ?? null };
}

// --- Category & parameter discovery -------------------------------------

// One category match per item, not a fixed constant — resolved live from
// the listing title, same reasoning as suggestOlxCategory.
export async function suggestAllegroCategory(token: string, title: string): Promise<AllegroResult<string>> {
  const url = new URL(`${API_BASE}/sale/matching-categories`);
  url.searchParams.set("name", title);
  const res = await fetch(url, { headers: authedHeaders(token, false) });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: allegroErrorMessage(data, res.status) };

  const first = data?.matchingCategories?.[0];
  if (!first?.id) return { ok: false, error: "Allegro nie zaproponowało żadnej kategorii dla tego tytułu" };
  return { ok: true, data: String(first.id) };
}

export type AllegroDictionaryOption = { id: string; value: string };
export type AllegroCategoryParameter = {
  id: string;
  name: string;
  type: string;
  required: boolean;
  unit: string | null;
  describesProduct: boolean;
  dictionary: AllegroDictionaryOption[];
  maxLength: number | null;
};

// describesProduct splits every category's parameters in two: offer-level
// (e.g. "Stan"/condition — goes in the offer's own `parameters`) vs
// product-level (brand, size, color, material, ... — goes inside
// productSet[0].product.parameters). Verified live: sending a
// describesProduct=true parameter in the offer's top-level `parameters`
// gets rejected with "should not be specified as in section `offer`".
export async function getAllegroCategoryParameters(
  token: string,
  categoryId: string
): Promise<AllegroResult<AllegroCategoryParameter[]>> {
  const res = await fetch(`${API_BASE}/sale/categories/${categoryId}/parameters`, {
    headers: authedHeaders(token, false),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: allegroErrorMessage(data, res.status) };

  const params: AllegroCategoryParameter[] = (data?.parameters ?? []).map(
    (p: {
      id: string;
      name: string;
      type: string;
      required: boolean;
      unit?: string | null;
      options?: { describesProduct?: boolean };
      dictionary?: { id: string; value: string }[];
      restrictions?: { maxLength?: number };
    }) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      required: p.required,
      unit: p.unit ?? null,
      describesProduct: p.options?.describesProduct ?? false,
      dictionary: p.dictionary ?? [],
      maxLength: p.restrictions?.maxLength ?? null,
    })
  );
  return { ok: true, data: params };
}

// --- Images ---------------------------------------------------------------

// Allegro doesn't accept an arbitrary external URL directly in an offer —
// each image is first uploaded here (a signed Supabase URL works fine as
// the source), returning an Allegro-hosted URL to reference in the offer.
export async function uploadAllegroImage(token: string, sourceUrl: string): Promise<AllegroResult<string>> {
  const res = await fetch(`${API_BASE}/sale/images`, {
    method: "POST",
    headers: authedHeaders(token, true),
    body: JSON.stringify({ url: sourceUrl }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.location) return { ok: false, error: allegroErrorMessage(data, res.status) };
  return { ok: true, data: data.location };
}

// --- Parameter mapping ------------------------------------------------

type AllegroParamValue = { id: string; valuesIds?: string[]; values?: string[] };

// EAN this app knowingly never sends despite some categories listing it as
// required — verified live (2026-08-23) that omitting it entirely still
// produces a clean create there. Not a universal rule, though: a later
// category ("Botki") rejected the create outright over the same treatment
// of "Kod producenta" ("Nie można stworzyć produktu bez podania poprawnych
// wartości wszystkich parametrów wymaganych: [Kod producenta]"), so that one
// is deliberately NOT in this list — it now falls through to the generic
// manual-field mechanism below like Kolor/Materiał/Zapięcie do.
const ALLEGRO_SKIP_PARAM_NAMES = new Set(["EAN (GTIN)"]);

// Params this app derives automatically from item data (see
// buildAllegroParameters) — never offered as a manual field even when
// required, since a value already gets computed for them one way or
// another (a dictionary match, an inferred gender, or a hard failure with
// its own specific message).
const ALLEGRO_AUTO_HANDLED_PARAM_NAMES = new Set([
  "Stan",
  "Marka",
  "Rozmiar",
  "Płeć",
  "Model",
  "Długość wkładki",
]);

function findDictionaryOption(
  dictionary: AllegroDictionaryOption[],
  candidate: string
): AllegroDictionaryOption | null {
  const normalized = candidate.trim().toLowerCase();
  return dictionary.find((o) => o.value.trim().toLowerCase() === normalized) ?? null;
}

function mapConditionToAllegroStan(condition: string | null): "Nowy" | "Używany" {
  return condition === "Nowe" ? "Nowy" : "Używany";
}

// Płeć isn't tracked on items at all — but the matched category is already
// gender-specific (Damskie/Męskie/Dziecko live at different branches of
// Allegro's category tree), so its Płeć dictionary is usually just
// {that gender, uniseks}. Picking the sole non-uniseks option covers the
// normal damskie/męskie case without asking for input; a category whose
// dictionary has more than one non-uniseks option (seen on some Dziecko
// categories: chłopiec/dziewczynka/uniseks) is genuinely ambiguous from our
// data and falls through to the generic required-param failure below.
function inferAllegroGenderOption(dictionary: AllegroDictionaryOption[]): AllegroDictionaryOption | null {
  const nonUnisex = dictionary.filter((o) => o.value.trim().toLowerCase() !== "uniseks");
  if (nonUnisex.length === 1) return nonUnisex[0];
  return findDictionaryOption(dictionary, "uniseks");
}

export type AllegroItemFields = {
  condition: string | null;
  size: string | null;
  brand: string | null;
  model: string | null;
  insoleLength: string | null;
};

export type AllegroManualParam = {
  id: string;
  name: string;
  type: string;
  unit: string | null;
  options: string[];
};

// Every required, product-describing category parameter this app can't
// derive automatically or safely skip — Kolor and Materiał zewnętrzny on a
// sneaker, but also Zapięcie or Wysokość obcasa/platformy on a boot, or
// whatever the next never-seen category turns out to need. Rather than
// hard-coding one field at a time as each new category surfaces one (that
// happened twice live already — Materiał zewnętrzny, then Wysokość
// obcasa/platformy on the very next category), the publish form asks for
// exactly this list, whatever it is, dictionary fields as a dropdown and
// everything else as free text/number.
export function getAllegroManualParams(categoryParameters: AllegroCategoryParameter[]): AllegroManualParam[] {
  return categoryParameters
    .filter(
      (p) =>
        p.describesProduct &&
        p.required &&
        !ALLEGRO_SKIP_PARAM_NAMES.has(p.name) &&
        !ALLEGRO_AUTO_HANDLED_PARAM_NAMES.has(p.name)
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      unit: p.unit,
      options: p.dictionary.map((o) => o.value),
    }));
}

export type AllegroBuiltParameters = {
  offerParameters: AllegroParamValue[];
  productParameters: AllegroParamValue[];
};

// Builds both parameter arrays from the category's own live schema (see
// getAllegroCategoryParameters) — a required parameter this function can't
// confidently map is a hard failure (better than submitting a value Allegro
// will reject, or worse, a wrong one it silently accepts), same principle
// as buildOlxAttributes. manualValues carries whatever the publisher typed
// for the params getAllegroManualParams flagged, keyed by parameter id.
export function buildAllegroParameters(
  categoryParameters: AllegroCategoryParameter[],
  item: AllegroItemFields,
  manualValues: Record<string, string>
): AllegroResult<AllegroBuiltParameters> {
  const offerParameters: AllegroParamValue[] = [];
  const productParameters: AllegroParamValue[] = [];

  for (const param of categoryParameters) {
    if (ALLEGRO_SKIP_PARAM_NAMES.has(param.name)) continue;

    let option: AllegroDictionaryOption | null = null;
    let stringValue: string | null = null;

    if (param.name === "Stan") {
      option = findDictionaryOption(param.dictionary, mapConditionToAllegroStan(item.condition));
    } else if (param.name === "Marka") {
      option = item.brand ? findDictionaryOption(param.dictionary, item.brand) : null;
    } else if (param.name === "Rozmiar") {
      option = item.size ? findDictionaryOption(param.dictionary, item.size) : null;
    } else if (param.name === "Płeć") {
      option = inferAllegroGenderOption(param.dictionary);
    } else if (param.name === "Model") {
      const trimmed = item.model?.trim() || null;
      stringValue = trimmed && param.maxLength ? trimmed.slice(0, param.maxLength) : trimmed;
    } else if (param.name === "Długość wkładki") {
      const parsed = item.insoleLength ? Number(item.insoleLength.replace(",", ".")) : NaN;
      stringValue = Number.isFinite(parsed) ? String(parsed) : null;
    } else {
      const manual = manualValues[param.id]?.trim();
      if (manual) {
        if (param.type === "dictionary") {
          option = findDictionaryOption(param.dictionary, manual);
        } else {
          stringValue = param.maxLength ? manual.slice(0, param.maxLength) : manual;
        }
      }
    }

    const target = param.describesProduct ? productParameters : offerParameters;
    if (option) {
      target.push({ id: param.id, valuesIds: [option.id] });
    } else if (stringValue) {
      target.push({ id: param.id, values: [stringValue] });
    } else if (param.required) {
      return {
        ok: false,
        error: `Nie udało się dopasować wymaganego parametru Allegro „${param.name}” dla tego towaru`,
      };
    }
  }

  return { ok: true, data: { offerParameters, productParameters } };
}

// Allegro's description is a structured document, not a plain string.
// Verified live (2026-08-23): a section's `items` array is capped at 2 — one
// TEXT item per paragraph blew past that on any multi-paragraph listing
// ("items" size must be between 1 and 2"). All paragraphs go into a single
// TEXT item's HTML content instead, which has no such cap.
export function buildAllegroDescription(text: string) {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    sections: [
      {
        items: [{ type: "TEXT", content: paragraphs.map((p) => `<p>${p}</p>`).join("") }],
      },
    ],
  };
}

// --- Offers ---------------------------------------------------------------

export type AllegroOfferPayload = {
  title: string;
  description: string;
  categoryId: string;
  price: number;
  offerParameters: AllegroParamValue[];
  productParameters: AllegroParamValue[];
  images: string[];
  active: boolean;
};

export type AllegroOffer = { id: string; status: string; url: string };

function allegroOfferUrl(id: string): string {
  return `https://allegro.pl/oferta/${id}`;
}

export async function createAllegroOffer(
  token: string,
  payload: AllegroOfferPayload
): Promise<AllegroResult<AllegroOffer>> {
  const res = await fetch(`${API_BASE}/sale/product-offers`, {
    method: "POST",
    headers: authedHeaders(token, true),
    body: JSON.stringify({
      productSet: [
        {
          // Every item this business sells is second-hand — declaring this
          // is what lets Allegro skip the GPSR responsibleProducer /
          // safetyInformation requirements it otherwise demands for every
          // new product proposal. Verified live: without this flag, create
          // still succeeds (201) but validation.errors flags both as
          // missing, which blocks going ACTIVE; with it, validation.errors
          // comes back empty for a "Używany" item.
          marketedBeforeGPSRObligation: true,
          product: {
            name: payload.title,
            category: { id: payload.categoryId },
            parameters: payload.productParameters,
            images: payload.images,
          },
        },
      ],
      category: { id: payload.categoryId },
      parameters: payload.offerParameters,
      description: buildAllegroDescription(payload.description),
      sellingMode: { format: "BUY_NOW", price: { amount: payload.price.toFixed(2), currency: "PLN" } },
      stock: { available: 1, unit: "UNIT" },
      location: ALLEGRO_LOCATION,
      // Also lists the offer on allegro-business-pl (the B2B marketplace),
      // not just the consumer allegro-pl one — verified live that this
      // flips additionalMarketplaces["allegro-business-pl"].publication.state
      // from "NOT_REQUESTED" to "PENDING" with no validation errors.
      publication: {
        status: payload.active ? "ACTIVE" : "INACTIVE",
        marketplaces: { additional: [{ id: "allegro-business-pl" }] },
      },
      delivery: { shippingRates: { id: ALLEGRO_SHIPPING_RATES_ID }, handlingTime: "P1D" },
      // "VAT" here, not "VAT_MARGIN" — the seller confirmed this business
      // issues regular VAT invoices, not the used-goods margin scheme.
      payments: { invoice: "VAT" },
      afterSalesServices: {
        returnPolicy: { id: ALLEGRO_RETURN_POLICY_ID },
        impliedWarranty: { id: ALLEGRO_IMPLIED_WARRANTY_ID },
      },
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: allegroErrorMessage(data, res.status) };

  const validationErrors = data?.validation?.errors;
  if (Array.isArray(validationErrors) && validationErrors.length > 0) {
    const first = validationErrors[0] as { userMessage?: string; message?: string };
    return { ok: false, error: first.userMessage ?? first.message ?? "Oferta Allegro nie przeszła walidacji" };
  }

  return { ok: true, data: { id: data.id, status: data.publication?.status ?? "UNKNOWN", url: allegroOfferUrl(data.id) } };
}

export async function getAllegroOffer(token: string, offerId: string): Promise<AllegroResult<AllegroOffer>> {
  const res = await fetch(`${API_BASE}/sale/product-offers/${offerId}`, {
    headers: authedHeaders(token, false),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: allegroErrorMessage(data, res.status) };
  return {
    ok: true,
    data: { id: data.id, status: data.publication?.status ?? "UNKNOWN", url: allegroOfferUrl(data.id) },
  };
}

// Ending is the only lifecycle action available for an already-ACTIVE
// offer — Allegro's DELETE only works on never-published drafts (verified
// live: DELETE /sale/offers/{id} 204's a draft but 405's on
// /sale/product-offers/{id}).
export async function endAllegroOffer(token: string, offerId: string): Promise<AllegroResult<true>> {
  const res = await fetch(`${API_BASE}/sale/product-offers/${offerId}`, {
    method: "PATCH",
    headers: authedHeaders(token, true),
    body: JSON.stringify({ publication: { status: "ENDED" } }),
  });
  if (res.ok) return { ok: true, data: true };
  const data = await res.json().catch(() => null);
  return { ok: false, error: allegroErrorMessage(data, res.status) };
}
