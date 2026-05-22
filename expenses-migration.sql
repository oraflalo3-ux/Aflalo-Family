-- הוצאות יומיות לסיכום בוקר (WhatsApp) — הרץ ב-Supabase SQL Editor

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric not null default 0 check (amount >= 0),
  expense_date text not null default '',
  who text default 'שניהם',
  created_at timestamptz default now()
);

create index if not exists expenses_date_idx on expenses (expense_date);

alter table expenses enable row level security;

drop policy if exists "auth_full_access" on expenses;
create policy "auth_full_access" on expenses
  for all to authenticated using (true) with check (true);
