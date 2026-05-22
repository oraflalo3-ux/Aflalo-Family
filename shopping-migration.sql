-- רשימת סופר — קטגוריות ומיון (הרץ ב-Supabase SQL Editor)
alter table shopping add column if not exists category text default 'other';
alter table shopping add column if not exists sort_order int default 0;
alter table shopping add column if not exists added_by text default '';
