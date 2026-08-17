-- Historical purchase batches from the user's Google Sheet, imported as
-- informational records (purchase_cost/quantity/sales_amount/sold_pairs) —
-- these have no individual items tracked in the app, they're purely the
-- purchase/sale totals per batch. Run 2026-08-17-add-batches-sales-fields.sql
-- first.
--
-- Nazwa partii (label) = the batch letter (A, B, C…) as marked on the sheet.
-- Gdzie kupiono (purchase_location) = the seller/source name (e.g. "Wiltex
-- Zalando") shown above it — that name repeats for batches bought from the
-- same source twice, but the letter is unique per batch, so no renaming
-- workaround needed this time.
insert into batches (label, batch_number, purchase_cost, purchase_location, quantity, sales_amount, sold_pairs)
select
  v.label,
  v.rn + coalesce((select max(batch_number) from batches), 0),
  v.purchase_cost,
  v.purchase_location,
  v.quantity,
  v.sales_amount,
  v.sold_pairs
from (
  values
    (1,  'A', 'Wiltex Zalando',   15700, 283,  9428,  90),
    (2,  'B', 'Izi mix 26',       17700, 161,  8896,  54),
    (3,  'C', 'Izi Adidas б.у.',  11725, 99,   6090,  39),
    (4,  'D', 'Kraków Zalando',   12550, 227,  8681,  84),
    (5,  'E', 'Izi Adidas нові',  26500, 179,  9576,  40),
    (6,  'F', 'Izi Adidas C-D',   5000,  91,   495,   5),
    (7,  'G', 'Hoka 31',          9800,  75,   12350, 57),
    (8,  'H', 'Hoka 39,5',        19300, 115,  22333, 83),
    (9,  'I', 'Hoka 31',          50000, 375,  37308, 166),
    (10, 'J', 'Wiltex Zalando',   23500, 390,  5474,  46),
    (11, 'K', 'M Adidas б.у.',    25800, 240,  195,   1),
    (12, 'L', 'Hoka 38,5',        19300, 115,  null,  null),
    (13, 'M', 'Kraków Zalando',   17400, 270,  null,  null),
    (14, 'N', 'Hoka 30',          9750,  75,   null,  null)
) as v(rn, label, purchase_location, purchase_cost, quantity, sales_amount, sold_pairs)
where not exists (select 1 from batches b2 where b2.label = v.label);
