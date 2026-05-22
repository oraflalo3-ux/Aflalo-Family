-- הוצאות לפי נכס — טבלה אחידה (הרץ ב-Supabase SQL Editor)

create table if not exists asset_expenses (
  id uuid primary key default gen_random_uuid(),
  asset_type text not null,
  asset_id uuid not null,
  name text not null,
  amount numeric not null default 0,
  kind text not null default 'once',
  expense_date text default '',
  note text default '',
  created_at timestamptz default now()
);

create index if not exists asset_expenses_asset_idx on asset_expenses (asset_type, asset_id);

alter table asset_expenses enable row level security;
drop policy if exists "auth_full_access" on asset_expenses;
create policy "auth_full_access" on asset_expenses
  for all to authenticated using (true) with check (true);

-- מיגרציה מנתונים קיימים (בטוח להריץ שוב — בודק שלא כפול)
insert into asset_expenses (asset_type, asset_id, name, amount, kind, expense_date)
select 'property', property_id, name, amount, 'once', coalesce(expense_date, '')
from property_expenses pe
where not exists (
  select 1 from asset_expenses ae
  where ae.asset_type = 'property' and ae.asset_id = pe.property_id
    and ae.name = pe.name and ae.amount = pe.amount and ae.kind = 'once'
);

insert into asset_expenses (asset_type, asset_id, name, amount, kind, expense_date)
select 'property', id, 'משכנתא חודשית', monthly_mortgage, 'monthly', ''
from properties p
where monthly_mortgage > 0
  and not exists (
    select 1 from asset_expenses ae
    where ae.asset_type = 'property' and ae.asset_id = p.id and ae.name = 'משכנתא חודשית' and ae.kind = 'monthly'
  );

insert into asset_expenses (asset_type, asset_id, name, amount, kind, expense_date)
select 'property', id, 'הוצאות נכס חודשיות', monthly_expenses, 'monthly', ''
from properties p
where monthly_expenses > 0
  and not exists (
    select 1 from asset_expenses ae
    where ae.asset_type = 'property' and ae.asset_id = p.id and ae.name = 'הוצאות נכס חודשיות' and ae.kind = 'monthly'
  );

insert into asset_expenses (asset_type, asset_id, name, amount, kind, expense_date)
select 'loan', id, coalesce(nullif(trim(name), ''), 'החזר חודשי'), monthly, 'monthly', ''
from loans l
where monthly > 0
  and not exists (
    select 1 from asset_expenses ae where ae.asset_type = 'loan' and ae.asset_id = l.id and ae.kind = 'monthly'
  );

insert into asset_expenses (asset_type, asset_id, name, amount, kind, expense_date)
select 'savings_loan', id, coalesce(nullif(trim(name), ''), 'החזר מינוף'), monthly, 'monthly', ''
from savings_loans sl
where monthly > 0
  and not exists (
    select 1 from asset_expenses ae where ae.asset_type = 'savings_loan' and ae.asset_id = sl.id and ae.kind = 'monthly'
  );

insert into asset_expenses (asset_type, asset_id, name, amount, kind, expense_date)
select 'car', car_id, type || coalesce(' — ' || nullif(trim(note), ''), ''), cost, 'once', event_date
from car_events ce
where cost > 0
  and not exists (
    select 1 from asset_expenses ae
    where ae.asset_type = 'car' and ae.asset_id = ce.car_id and ae.name like ce.type || '%'
      and ae.amount = ce.cost and ae.expense_date = ce.event_date
  );
