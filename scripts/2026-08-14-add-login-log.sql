-- Run this in the Supabase SQL editor before using the login journal
-- (Pracownicy → Historia logowań).

create table if not exists auth_login_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  success boolean not null,
  employee_id uuid references employees(id) on delete set null,
  employee_name text,
  user_agent text,
  ip_address text,
  error_message text
);

create index if not exists auth_login_log_created_at_idx on auth_login_log(created_at desc);
