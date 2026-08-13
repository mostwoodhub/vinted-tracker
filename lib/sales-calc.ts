// Pricing math for manual sale entries, reverse-engineered from the migrated
// legacy `sales` data and verified to match exactly (0 rounding diff across
// a 20-row sample of income_tax_applied=true records):
//   vat_amount        = price * vat_rate / (100 + vat_rate)   (VAT-inclusive gross price)
//   income_tax_amount = price * 0.03                          (flat 3% ryczałt, when applied)
//   net_profit         = price - cost - fee - vat - income_tax

export const INCOME_TAX_RATE = 0.03;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calcFeeAmount(salePrice: number, feePercent: number): number {
  if (!salePrice || !feePercent) return 0;
  return round2((salePrice * feePercent) / 100);
}

export function calcVatAmount(salePrice: number, vatRate: number): number {
  if (!salePrice || !vatRate) return 0;
  return round2((salePrice * vatRate) / (100 + vatRate));
}

export function calcIncomeTaxAmount(salePrice: number, applied: boolean): number {
  if (!applied || !salePrice) return 0;
  return round2(salePrice * INCOME_TAX_RATE);
}

export function calcNetProfit(params: {
  salePrice: number;
  costPrice: number;
  feeAmount: number;
  vatAmount: number;
  incomeTaxAmount: number;
}): number {
  const { salePrice, costPrice, feeAmount, vatAmount, incomeTaxAmount } = params;
  return round2(salePrice - costPrice - feeAmount - vatAmount - incomeTaxAmount);
}
