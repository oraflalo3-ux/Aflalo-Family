-- משפחת אפללו — schema מלא
-- הרץ את זה ב-Supabase SQL Editor

-- חסכונות: קטגוריות
create table savings_cats (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text default '💰',
  color text default '#E6F1FB',
  type text default 'bank', -- bank | stocks | pension | other
  display_order int default 0,
  created_at timestamptz default now()
);

-- חסכונות: חשבונות בתוך קטגוריה
create table savings_accounts (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid references savings_cats(id) on delete cascade,
  name text not null,
  amount numeric default 0,
  goal numeric default 0,
  note text default '',
  created_at timestamptz default now()
);

-- חסכונות: מניות בתוך קטגוריה
create table savings_stocks (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid references savings_cats(id) on delete cascade,
  symbol text not null,
  name text default '',
  units numeric default 0,
  change_pct numeric default null,
  created_at timestamptz default now()
);

-- הלוואות על חסכונות (מינוף)
create table savings_loans (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid references savings_cats(id) on delete cascade,
  name text not null,
  balance numeric default 0,
  monthly numeric default 0,
  rate numeric default 0,
  note text default '',
  created_at timestamptz default now()
);

-- הלוואות כלליות
create table loans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  balance numeric default 0,
  monthly numeric default 0,
  note text default '',
  created_at timestamptz default now()
);

-- כרטיסי אשראי
create table credit_cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  credit_limit numeric default 0,
  used numeric default 0,
  cycle text default '',
  created_at timestamptz default now()
);

-- תזרים
create table cashflow (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric default 0,
  type text default 'expense', -- income | expense
  is_fixed boolean not null default false, -- קבועה: נספרת כל חודש בלי להוסיף מחדש
  created_at timestamptz default now()
);

create index cashflow_is_fixed_idx on cashflow (is_fixed);

-- יומן תזרים: סיכום חודשי (הכנסות מול הוצאות) לפי שנה/חודש
create table cashflow_monthly (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int not null check (month >= 1 and month <= 12),
  income_total numeric not null default 0,
  expense_total numeric not null default 0,
  note text default '',
  closed_at timestamptz default now(),
  unique (year, month)
);

create index cashflow_monthly_year_idx on cashflow_monthly (year desc, month desc);

-- נדל"ן
create table properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text default '🏠',
  address text default '',
  value numeric default 0,
  mortgage numeric default 0,
  monthly_mortgage numeric default 0,
  monthly_expenses numeric default 0,
  rental_income numeric default 0,
  is_rented boolean default false,
  last_valuation_date text default '',
  created_at timestamptz default now()
);

-- הוצאות לפי נכס (חודשי / חד-פעמי) — מקור אחיד
create table asset_expenses (
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
create index asset_expenses_asset_idx on asset_expenses (asset_type, asset_id);

-- הוצאות חד-פעמיות לנכס (ישן — מועבר ל-asset_expenses)
create table property_expenses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  name text not null,
  amount numeric default 0,
  expense_date text default '',
  created_at timestamptz default now()
);

-- רכבים
create table cars (
  id uuid primary key default gen_random_uuid(),
  make text not null,
  model text not null,
  year int default 2020,
  plate text default '',
  odometer_km int default 0,
  created_at timestamptz default now()
);

-- יומן טיפולים / טסטים שבוצעו
create table car_service_log (
  id uuid primary key default gen_random_uuid(),
  car_id uuid references cars(id) on delete cascade,
  type text not null,
  performed_date text not null,
  odometer_km int not null default 0,
  cost numeric default 0,
  note text default '',
  created_at timestamptz default now()
);
create index car_service_log_car_idx on car_service_log (car_id, performed_date desc);

-- אירועי רכב
create table car_events (
  id uuid primary key default gen_random_uuid(),
  car_id uuid references cars(id) on delete cascade,
  type text not null,
  event_date text not null,
  note text default '',
  cost numeric default 0,
  created_at timestamptz default now()
);

-- קניות — רשימות (סופר, פארם, איקאה…)
create table shopping_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table shopping_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references shopping_lists(id) on delete cascade,
  name text not null,
  qty text default '1',
  bought boolean default false,
  created_at timestamptz default now()
);
create index shopping_items_list_id_idx on shopping_items (list_id);
create index shopping_items_list_bought_idx on shopping_items (list_id, bought);

-- קניות — רשימה לקנייה הנוכחית (legacy)
create table shopping (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  qty text default '1',
  category text default 'other',
  sort_order int default 0,
  added_by text default '',
  done boolean default false,
  created_at timestamptz default now()
);

-- קניות — רשימה קבועה (תבנית משפחתית)
create table shopping_staples (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  qty text default '1',
  category text default 'other',
  sort_order int default 0,
  created_at timestamptz default now()
);
create unique index shopping_staples_name_lower_idx on shopping_staples (lower(trim(name)));

-- חוגים
create table activities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  child text default '',
  day text default '',
  cost numeric default 0,
  created_at timestamptz default now()
);

-- משימות
create table tasks (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  who text default 'שניהם',
  due_date text not null default '',
  done boolean default false,
  created_at timestamptz default now()
);

-- תזכורות
create table reminders (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  reminder_date text default '',
  who text default 'שניהם',
  created_at timestamptz default now()
);

-- תצוגה משותפת (שורה אחת — אותו ממשק לכל המשפחה)
create table family_prefs (
  singleton int primary key default 1 check (singleton = 1),
  show_finance boolean not null default true,
  show_savings boolean not null default true,
  show_realestate boolean not null default true,
  show_cars boolean not null default true,
  show_daily boolean not null default true,
  show_alerts boolean not null default true,
  updated_at timestamptz default now()
);

insert into family_prefs (singleton) values (1);

-- התראות עדכון
create table alert_defs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text default 'general',
  freq text default 'monthly',
  next_date text not null,
  active boolean default true,
  created_at timestamptz default now()
);

-- היסטוריית התראות
create table alert_history (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  done_at timestamptz default now()
);

-- נתוני דוגמה
insert into savings_cats (name, icon, color, type, display_order) values
  ('בנק הפועלים', '🏦', '#E6F1FB', 'bank', 1),
  ('שוק ההון', '📈', '#E1F5EE', 'stocks', 2),
  ('קרן השתלמות', '🌱', '#FAEEDA', 'pension', 3),
  ('קופת גמל', '🏛️', '#FBEAF0', 'pension', 4),
  ('חסכון תינוק', '👶', '#EAF3DE', 'bank', 5);

insert into loans (name, balance, monthly, note) values
  ('הלוואת רכב', 18000, 900, 'עוד 20 חודשים');

insert into credit_cards (name, credit_limit, used, cycle) values
  ('ויזה כאל', 15000, 4200, '10 לחודש'),
  ('מסטרקארד', 8000, 1800, '3 לחודש');

insert into cashflow (name, amount, type) values
  ('משכורת א׳', 15000, 'income'),
  ('משכורת ב׳', 12000, 'income'),
  ('מכולת', 3500, 'expense'),
  ('חינוך', 1200, 'expense'),
  ('ביטוחים', 1400, 'expense');

insert into alert_defs (name, category, freq, next_date) values
  ('עדכון שווי נדל"ן', 'realestate', 'quarterly', '2025-10-01'),
  ('עדכון יתרות חסכונות', 'savings', 'monthly', '2025-07-01');

-- אבטחה: רק משתמשים מחוברים (ראה גם auth-migration.sql לפרויקט קיים)
alter table savings_cats enable row level security;
alter table savings_accounts enable row level security;
alter table savings_stocks enable row level security;
alter table savings_loans enable row level security;
alter table loans enable row level security;
alter table credit_cards enable row level security;
alter table cashflow enable row level security;
alter table cashflow_monthly enable row level security;
alter table properties enable row level security;
alter table property_expenses enable row level security;
alter table cars enable row level security;
alter table car_events enable row level security;
alter table shopping_lists enable row level security;
alter table shopping_items enable row level security;
alter table shopping enable row level security;
alter table activities enable row level security;
alter table tasks enable row level security;
alter table reminders enable row level security;
alter table family_prefs enable row level security;
alter table alert_defs enable row level security;
alter table alert_history enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'savings_cats','savings_accounts','savings_stocks','savings_loans',
    'loans','credit_cards','cashflow','cashflow_monthly','properties','property_expenses','asset_expenses',
    'cars','car_events','car_service_log','shopping_lists','shopping_items','shopping','shopping_staples','activities','tasks','reminders',
    'family_prefs','alert_defs','alert_history'
  ]
  loop
    execute format(
      'create policy "auth_full_access" on %I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;
