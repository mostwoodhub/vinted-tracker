-- Tracks which employee recorded each sale, so non-admin employees (e.g.
-- the "sales" role) can be scoped to only the sales they entered
-- themselves. Historical rows are left null (nobody attributable) and
-- simply won't show up under anyone's "my sales" filter.
alter table sales add column if not exists created_by uuid references employees(id);
