-- תאריך יעד למטלות (WhatsApp + ממשק) — הרץ ב-Supabase SQL Editor

alter table tasks add column if not exists due_date text not null default '';

create index if not exists tasks_due_date_idx on tasks (due_date);
