-- רשימות קניות (סופר, פארם, איקאה…) — הרץ ב-Supabase SQL Editor
-- אחרי ההרצה: Database → Replication → הפעל shopping_lists + shopping_items

create table if not exists shopping_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists shopping_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references shopping_lists(id) on delete cascade,
  name text not null,
  qty text default '1',
  bought boolean default false,
  created_at timestamptz default now()
);

create index if not exists shopping_items_list_id_idx on shopping_items (list_id);
create index if not exists shopping_items_list_bought_idx on shopping_items (list_id, bought);

alter table shopping_lists enable row level security;
alter table shopping_items enable row level security;

drop policy if exists "auth_full_access" on shopping_lists;
create policy "auth_full_access" on shopping_lists
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_full_access" on shopping_items;
create policy "auth_full_access" on shopping_items
  for all to authenticated using (true) with check (true);
