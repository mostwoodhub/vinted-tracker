// Picking "Vinted DE"/"Vinted IT" from the platform list is meant to be the
// ONE decision that drives everything else about a foreign-account sale —
// country (for the VAT preset) and which account it actually is — rather
// than making the employee separately set Kraj and Konto too. Currency here
// is deliberately independent of the account's own `currency` column (see
// applySaleCurrencyConversion) — this mapping is checked first, so it works
// even before/without setting that column on the account itself.
//
// `countries` is the account's own home country first, then every
// cross-border destination that account's Vinted country picker actually
// offers (per the user, checked directly in each account) — the
// Polska-derived full list in country-vat-rates.ts doesn't apply to a
// German/Italian account's buyers.
//
// Plain data, no I/O — safe to import from both client components (for the
// platform-change autofill) and server actions (for the currency lookup).
export const VINTED_COUNTRY_PLATFORMS: Record<
  string,
  { country: string; countries: string[]; accountName: string; currency: string }
> = {
  "Vinted DE": {
    country: "Niemcy",
    countries: ["Niemcy", "Francja", "Włochy", "Holandia", "Austria"],
    accountName: "Antvntde",
    currency: "EUR",
  },
  "Vinted IT": {
    country: "Włochy",
    countries: [
      "Włochy",
      "Hiszpania",
      "Francja",
      "Portugalia",
      "Holandia",
      "Belgia",
      "Luksemburg",
      "Niemcy",
      "Austria",
    ],
    accountName: "Vintusss - V",
    currency: "EUR",
  },
};

// Every country reachable through either DE or IT — their VAT rates in
// country-vat-rates.ts are all guesses (defaulted to Polska's, no
// historical data exists yet for any of them), so a sale into one of
// these defaults to no VAT / no income tax rather than presenting a
// specific rate that's actually unverified. Per the user — real tax
// handling for these markets to be sorted out separately, not guessed at
// per-sale in the meantime.
export const VINTED_UNVERIFIED_VAT_COUNTRIES = new Set(
  Object.values(VINTED_COUNTRY_PLATFORMS).flatMap((p) => p.countries)
);
