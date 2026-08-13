// Most frequent (mode) historical vat_rate per country, computed from all
// 3848 migrated `sales` rows (see project history for the query). Used to
// pre-fill the VAT field on manual entry — the user can still edit it.
export const COUNTRY_VAT_RATE_MODE: Record<string, number> = {
  Polska: 23,
  Czechy: 21,
  Słowacja: 23,
  Węgry: 27,
  Rumunia: 21,
  Chorwacja: 25,
  Słowenia: 22,
  Litwa: 21,
  Łotwa: 21,
  Estonia: 24,
  Finlandia: 25.5,
  Szwecja: 25,
  Dania: 25,
};

export const COUNTRIES = Object.keys(COUNTRY_VAT_RATE_MODE);
