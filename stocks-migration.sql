-- הרץ ב-Supabase SQL Editor אם הוספת מניות לא מציגה אחוז שינוי / עדכון מחיר נכשל
alter table savings_stocks add column if not exists change_pct numeric default null;
