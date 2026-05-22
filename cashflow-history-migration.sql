-- יומן תזרים חודשי/שנתי — הרץ ב-Supabase SQL Editor (פרויקט קיים)

create table if not exists cashflow_monthly (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int not null check (month >= 1 and month <= 12),
  income_total numeric not null default 0,
  expense_total numeric not null default 0,
  note text default '',
  closed_at timestamptz default now(),
  unique (year, month)
);

create index if not exists cashflow_monthly_year_idx on cashflow_monthly (year desc, month desc);

alter table cashflow_monthly enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cashflow_monthly' and policyname = 'auth_full_access'
  ) then
    create policy "auth_full_access" on cashflow_monthly
      for all to authenticated using (true) with check (true);
  end if;
end $$;
