// Picking "Vinted DE"/"Vinted IT" from the platform list is meant to be the
// ONE decision that drives everything else about a foreign-account sale —
// country (for the VAT preset) and which account it actually is — rather
// than making the employee separately set Kraj and Konto too. Currency here
// is deliberately independent of the account's own `currency` column (see
// applySaleCurrencyConversion) — this mapping is checked first, so it works
// even before/without setting that column on the account itself.
//
// Plain data, no I/O — safe to import from both client components (for the
// platform-change autofill) and server actions (for the currency lookup).
export const VINTED_COUNTRY_PLATFORMS: Record<
  string,
  { country: string; accountName: string; currency: string }
> = {
  "Vinted DE": { country: "Niemcy", accountName: "Antvntde", currency: "EUR" },
  "Vinted IT": { country: "Włochy", accountName: "Vintusss - V", currency: "EUR" },
};
