-- הרץ ב-Supabase SQL Editor אחרי שיצרת משתמשים ב-Authentication
-- Dashboard → Authentication → Users → Add user (2 משתמשים: אתה + אשתך)

-- הפעלת RLS — רק משתמשים מחוברים רואים ומשנים נתונים
alter table savings_cats enable row level security;
alter table savings_accounts enable row level security;
alter table savings_stocks enable row level security;
alter table savings_loans enable row level security;
alter table loans enable row level security;
alter table credit_cards enable row level security;
alter table cashflow enable row level security;
alter table properties enable row level security;
alter table property_expenses enable row level security;
alter table cars enable row level security;
alter table car_events enable row level security;
alter table shopping enable row level security;
alter table activities enable row level security;
alter table tasks enable row level security;
alter table reminders enable row level security;
alter table alert_defs enable row level security;
alter table alert_history enable row level security;

-- מדיניות: גישה מלאה למשתמשים מאומתים (משפחה קטנה — אין הפרדת tenant)
do $$
declare
  t text;
begin
  foreach t in array array[
    'savings_cats','savings_accounts','savings_stocks','savings_loans',
    'loans','credit_cards','cashflow','properties','property_expenses',
    'cars','car_events','shopping','activities','tasks','reminders',
    'alert_defs','alert_history'
  ]
  loop
    execute format('drop policy if exists "auth_full_access" on %I', t);
    execute format(
      'create policy "auth_full_access" on %I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;
