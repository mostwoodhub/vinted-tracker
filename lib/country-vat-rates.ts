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
  // No historical sales exist under any of these yet (the DE/IT Vinted
  // accounts are new) — all defaulted to the same rate as Polska per the
  // user, editable per-sale like every other country here. The set covers
  // every cross-border destination the DE and IT accounts' own Vinted
  // country pickers actually offer (per the user, checked directly in
  // each account) — see VINTED_COUNTRY_PLATFORMS.
  Niemcy: 23,
  Włochy: 23,
  Francja: 23,
  Holandia: 23,
  Austria: 23,
  Hiszpania: 23,
  Portugalia: 23,
  Belgia: 23,
  Luksemburg: 23,
};

export const COUNTRIES = Object.keys(COUNTRY_VAT_RATE_MODE);
