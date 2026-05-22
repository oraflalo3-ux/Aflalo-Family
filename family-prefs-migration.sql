-- תצוגה משותפת לכל המשפחה (אותו מסך לשני המשתמשים)
-- הרץ ב-Supabase SQL Editor

create table if not exists family_prefs (
  singleton int primary key default 1 check (singleton = 1),
  show_finance boolean not null default true,
  show_savings boolean not null default true,
  show_realestate boolean not null default true,
  show_cars boolean not null default true,
  show_daily boolean not null default true,
  show_alerts boolean not null default true,
  updated_at timestamptz default now()
);

insert into family_prefs (singleton)
values (1)
on conflict (singleton) do nothing;

alter table family_prefs enable row level security;

drop policy if exists "auth_full_access" on family_prefs;
create policy "auth_full_access" on family_prefs
  for all to authenticated using (true) with check (true);
