-- Accounts that sell in a currency other than PLN (e.g. the DE/IT Vinted
-- accounts, which settle in EUR) need this recorded so sales entered
-- against them can be converted to PLN before anything downstream (fees,
-- VAT, profit, statistics) touches the amount.
alter table sales_accounts_archive
  add column if not exists currency text not null default 'PLN';

-- Original (pre-conversion) amounts + the rate actually used, kept purely
-- for reference/audit — every other sales column (sale_price, cost_price,
-- fee_amount, vat_amount, net_profit, ...) is always PLN going forward,
-- exactly as it already was for every existing row.
alter table sales
  add column if not exists original_currency text,
  add column if not exists original_sale_price numeric,
  add column if not exists original_cost_price numeric,
  add column if not exists exchange_rate numeric;
