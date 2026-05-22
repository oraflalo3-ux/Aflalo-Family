-- הוצאות/הכנסות קבועות (כל חודש בלי להוסיף מחדש)
-- הרץ ב-Supabase SQL Editor

alter table cashflow add column if not exists is_fixed boolean not null default false;

create index if not exists cashflow_is_fixed_idx on cashflow (is_fixed);
