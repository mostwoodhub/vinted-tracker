-- Adds soft-delete support to items, matching the existing pattern already
-- used for sales.deleted_at / expenses.deleted_at.
alter table items add column if not exists deleted_at timestamptz;

create index if not exists items_deleted_at_idx on items(deleted_at);
