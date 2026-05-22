# משפחת אפללו 🏠

מערכת ניהול מידע משפחתי — חסכונות, נדל"ן, רכבים, תזרים ועוד.

## הקמה — 4 שלבים

### שלב 1 — Supabase
1. היכנס ל-[supabase.com](https://supabase.com) וצור פרויקט חדש בשם `bayit-shelanu`
2. לאחר יצירת הפרויקט, לך ל: **SQL Editor** → **New Query**
3. העתק את כל התוכן של הקובץ `schema.sql` והרץ אותו
4. לך ל: **Project Settings → API** ושמור את:
   - `Project URL` (נראה כך: `https://xxxx.supabase.co`)
   - `anon public key` (מחרוזת ארוכה מאוד)

### שלב 2 — GitHub Repository
1. היכנס ל-[github.com](https://github.com) וצור Repository חדש
2. שם: `bayit-shelanu`
3. סמן **Public**
4. לחץ **Create repository**

### שלב 1ב — משתמשים ואבטחה (חובה)
1. ב-Supabase: **Authentication → Providers** — ודא ש-**Email** מופעל
2. **Authentication → Users → Add user** — צור 2 משתמשים, לדוגמה:
   - `ora@bayit.local` + סיסמה חזקה
   - `partner@bayit.local` + סיסמה חזקה  
   (סמן **Auto Confirm User** כדי שלא תצטרך אימות מייל)
3. ב-**SQL Editor** הרץ את הקובץ `auth-migration.sql` (מגן על כל הטבלאות — בלי זה הנתונים פתוחים לכולם עם ה-anon key)
4. בפרויקט קיים: הרץ גם `stocks-migration.sql`, `cashflow-history-migration.sql`, `cashflow-fixed-migration.sql`

### שלב 3 — העלאת קבצים
העלה את הקבצים הבאים ל-GitHub:
- `index.html`
- `app.js`
- `config.js` (או `config.example.js` → שנה ל-`config.js` עם ה-URL וה-Key)
- `manifest.json`
- `icon.svg`

**איך להעלות:**
- לחץ **Add file → Upload files** ב-GitHub
- גרור את הקבצים
- לחץ **Commit changes**

### שלב 4 — GitHub Pages
1. ב-Repository לחץ **Settings**
2. גלול ל-**Pages**
3. תחת Source בחר **Deploy from a branch**
4. Branch: **main** → folder: **/ (root)**
5. לחץ **Save**

תוך כ-2 דקות תקבל כתובת: `https://your-username.github.io/Aflalo-Family`

## כניסה ראשונה
1. פתח את הכתובת שקיבלת
2. אם אין `config.js` עם פרטי Supabase — הכנס **URL** ו-**Anon Key** (פעם אחת)
3. היכנס עם **שם משתמש** ו**סיסמה** (כפי שיצרת ב-Supabase)
4. המערכת תיטען עם נתוני דוגמה

## הוצאות קבועות
במסך **תזרים** → **+ קבועה** (משכורת, ביטוח, משכנתא וכו') — נשאר בחישוב **כל חודש** בלי להוסיף מחדש.  
**+ משתנה** — למכולת ודברים שמשתנים. אפשר להעביר קיים בין קבועה/משתנה בלחיצה על **↔**.

## מסך בית (סקירה)
- **לטפל עכשיו** — רק דברים **באיחור** (רכב + התראות), עם כפתור ✓ בוצע
- **תזרים נטו** בולט; הוצאות קבועות/משתנות; שווי נטו תחת **עוד**
- **סגרתי את החודש** — גם מהבית וגם מתזרים

## יומן תזרים (היסטוריה)
במסך **תזרים** → **יומן היסטוריה**:
- **סגור חודש נוכחי** — שומר סיכום הכנסות/הוצאות/נטו (כולל נדל״ן) לחודש הנוכחי
- **חודש אחר…** — סגירה רטרואקטיבית (למשל ינואר 2026)
- בחר **שנה** (2026, 2027, 2028…) — טבלת 12 חודשים + **סיכום שנתי** בתחתית
- חודש נוכחי שלא נסגר מוצג כ**טיוטה**

## אותה תצוגה ואותם נתונים (שניכם)
1. **נתונים:** אותו Supabase (אותו `config.js` או אותו URL+מפתח בהגדרות) — כל שינוי כסף מופיע אצל שניכם.
2. **תצוגה:** כפתור **תצוגה** בראש → בחרו אילו לשוניות להציג. נשמר בענן — **מי שמשנה, השני רואה** אחרי רענון.
3. **בדיקה:** ליד הלוגו — `👥 משותף` + קוד פרויקט. אם הקוד שונה בין טלפון למחשב — הנתונים לא יתאימו.

הרץ ב-Supabase: `family-prefs-migration.sql`

## אייפון — אייקון במסך הבית (בלי כניסה בכל פעם)

1. **חובה:** מלא `config.js` עם Supabase URL + Anon key והעלה ל-**Aflalo-Family** (לא רק שמירה ידנית באפליקציה).
2. הוסף לאייקון רק מהכתובת: `https://oraflalo3-ux.github.io/Aflalo-Family/index.html`
3. אם היה אייקון ישן — **מחק** אותו והוסף מחדש (אחרי עדכון `manifest.json`).
4. כבה **גלישה פרטית** ב-Safari (חוסמת שמירה).
5. התחבר **פעם אחת** — אחר כך רק סיסמה לעיתים (לא URL/מפתח).

## גישה משותפת (שני בני זוג)
- שלח את אותה כתובת לבן/בת הזוג
- לכל אחד משתמש וסיסמה משלו (למשל `ora` ו-`partner`)
- כל שינוי שאחד עושה מופיע אצל השני מיד
- כפתור **יציאה** בסרגל העליון

## התקנה כאפליקציה על אייפון
1. **חובה:** העלה (`git push`) את הקבצים העדכניים ל-repo **`Aflalo-Family`** — גרסה ישנה ב-GitHub שמרה `bayit-shelanu` ב-`manifest.json` ובסקריפט
2. פתח **ב-Safari** (לא Chrome):  
   `https://oraflalo3-ux.github.io/Aflalo-Family/`  
   לפני «הוסף למסך הבית» — ודא שבשורת הכתובת מופיע **`Aflalo-Family`** ולא `bayit-shelanu`
3. רענון קשיח: גרור למטה לרענון / נקה cache של Safari לאתר
4. כפתור שיתוף (□↑) → **Add to Home Screen** — בדוק בתצוגה המקדימה שה-URL מסתיים ב-`/Aflalo-Family/`
5. **מחק** כל אייקון ישן מהמסך הבית לפני הוספה מחדש

**למה נשמר `bayit-shelanu`?**
- ב-GitHub Pages עדיין היה `manifest.json` עם `start_url` ל-`/bayit-shelanu/` (תוקן לנתיבים יחסיים)
- סקריפט ישן הפנה אפליקציה מ-standalone ל-`bayit-shelanu` (גרם ל-404)
- Safari זוכר כתובת ישנה מהיסטוריה — מחק אייקון ישן והוסף מחדש אחרי push

**אם עדיין 404 מהאייקון:** צור Repository נוסף בשם **`oraflalo3-ux.github.io`**, העלה אליו את הקובץ `github-user-site-index.html` כ-`index.html` (מפנה אוטומטית לאפליקציה).

## מבנה הקבצים
```
Aflalo-Family/
├── index.html         ← הממשק המלא
├── app.js             ← לוגיקה + התחברות + Supabase
├── config.js          ← URL ו-Anon Key (אופציונלי, מומלץ)
├── config.example.js  ← תבנית להעתקה
├── auth-migration.sql ← RLS לאבטחה (פרויקט קיים)
├── cashflow-history-migration.sql ← יומן תזרים חודשי
├── stocks-migration.sql ← עמודת change_pct למניות
├── manifest.json      ← הגדרות PWA (אייפון)
├── icon.svg           ← אייקון
└── schema.sql         ← מסד הנתונים (פרויקט חדש)
```

## שדרוגים עתידיים אפשריים
- Push notifications להתראות (דורש backend קטן)
- ייצוא לאקסל
- גרפים היסטוריים
- תמיכה במטבע זר
