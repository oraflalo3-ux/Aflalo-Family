-- יומן טיפולים וטסטים לרכב (הרץ ב-Supabase SQL Editor)

alter table cars add column if not exists odometer_km int default 0;

create table if not exists car_service_log (
  id uuid primary key default gen_random_uuid(),
  car_id uuid references cars(id) on delete cascade,
  type text not null,
  performed_date text not null,
  odometer_km int not null default 0,
  cost numeric default 0,
  note text default '',
  created_at timestamptz default now()
);

create index if not exists car_service_log_car_idx on car_service_log (car_id, performed_date desc);

alter table car_service_log enable row level security;
drop policy if exists "auth_full_access" on car_service_log;
create policy "auth_full_access" on car_service_log
  for all to authenticated using (true) with check (true);
