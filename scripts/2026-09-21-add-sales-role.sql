-- Adds "sales" to the set of allowed employees.role values.
-- Constraint name confirmed live via a deliberate insert failure:
--   "new row for relation "employees" violates check constraint "employees_role_check""
alter table employees drop constraint employees_role_check;
alter table employees add constraint employees_role_check
  check (role in ('intake', 'photographer', 'publisher', 'admin', 'sales'));
