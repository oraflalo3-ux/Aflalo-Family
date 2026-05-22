-- רשימת סופר קבועה + סנכרון (הרץ ב-Supabase SQL Editor)
-- אחרי ההרצה: Database → Replication → הפעל shopping + shopping_staples

create table if not exists shopping_staples (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  qty text default '1',
  category text default 'other',
  sort_order int default 0,
  created_at timestamptz default now()
);

create unique index if not exists shopping_staples_name_lower_idx on shopping_staples (lower(trim(name)));

alter table shopping_staples enable row level security;
drop policy if exists "auth_full_access" on shopping_staples;
create policy "auth_full_access" on shopping_staples
  for all to authenticated using (true) with check (true);

-- פריטים התחלתיים (רק אם הטבלה ריקה)
insert into shopping_staples (name, qty, category)
select v.name, v.qty, v.category from (values
  ('חלב', '2', 'dairy'),
  ('ביצים', '1', 'dairy'),
  ('גבינה צהובה', '1', 'dairy'),
  ('יוגורט', '6', 'dairy'),
  ('לחם', '1', 'grocery'),
  ('עגבניות', '1', 'produce'),
  ('מלפפון', '2', 'produce'),
  ('בננות', '1', 'produce'),
  ('עוף', '1', 'meat'),
  ('אורז', '1', 'grocery'),
  ('שמן', '1', 'grocery'),
  ('נייר טואלט', '1', 'cleaning')
) as v(name, qty, category)
where not exists (select 1 from shopping_staples limit 1)
  and not exists (
    select 1 from shopping_staples s where lower(trim(s.name)) = lower(trim(v.name))
  );
