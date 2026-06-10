# 🌴 Koh Samui Content Bot

מנוע תוכן אוטומטי לאתר [koh-samui-travels.com](https://koh-samui-travels.com)

מייצר מאמרים בעברית עם Claude ומפרסם אוטומטית ל-WordPress — 3 פעמים ביום.

---

## ⚡ מה זה עושה

- **3 מאמרים ביום** — בשעות 06:00, 13:00, 20:00 שעון ישראל
- **64 נושאים** מכוסים ב-8 קטגוריות, בסבב מחזורי
- כל מאמר **800–1200 מילים** בעברית תקנית
- כולל **SEO meta description** אוטומטי
- יוצר/מוצא **קטגוריות WordPress** אוטומטית

---

## 🗂️ קטגוריות

| קטגוריה | Slug | נושאים |
|---------|------|--------|
| חופים | beaches | 8 |
| אטרקציות | attractions | 8 |
| אוכל ומסעדות | food | 8 |
| תחבורה | transport | 8 |
| לייפסטייל | lifestyle | 8 |
| ספא ויוגה | spa | 8 |
| מסלולים | itinerary | 8 |
| מידע מעשי | practical | 8 |

---

## 🚀 הגדרה ראשונית (פעם אחת)

### שלב 1 — צור Repository ב-GitHub

```bash
# לוקלית:
git clone https://github.com/YOUR_USERNAME/koh-samui-content-bot.git
# העתק את קבצי הפרויקט לתוך התיקייה
git add .
git commit -m "Initial setup"
git push
```

### שלב 2 — הוסף Secrets ב-GitHub

ב-Repository שלך: **Settings → Secrets and variables → Actions → New repository secret**

הוסף את הבאים:

| שם Secret | ערך |
|-----------|-----|
| `CLAUDE_API_KEY` | המפתח מה-.env שלך |
| `WP_SITE_URL` | `https://koh-samui-travels.com` |
| `WP_USER` | שם המשתמש מה-.env |
| `WP_APP_PASSWORD` | הסיסמה מה-.env |

> ⚠️ **לא** לשים את ה-`.env` עצמו ב-GitHub! רק ה-Secrets.

### שלב 3 — בדוק שהכל עובד

```bash
cd scripts
npm install
CLAUDE_API_KEY=xxx WP_SITE_URL=https://koh-samui-travels.com \
  WP_USER=xxx WP_APP_PASSWORD=xxx \
  node test-connection.js
```

### שלב 4 — הפעל ידנית לבדיקה

ב-GitHub: **Actions → Koh Samui Content Bot → Run workflow**

---

## 🎯 הפעלה ידנית עם נושא ספציפי

ב-GitHub Actions, בלחיצה על "Run workflow" אפשר להזין:
- **topic**: `"חוף צ'אוואנג — המדריך המלא"` (כל טקסט חופשי)
- **category**: `beaches` (חייב להיות אחד מה-slugs)

---

## 📁 מבנה הפרויקט

```
koh-samui-content-bot/
├── .github/
│   └── workflows/
│       └── publish-articles.yml   # הגדרת ה-Cron + Workflow
└── scripts/
    ├── package.json
    ├── generate-and-publish.js    # הסקריפט הראשי
    ├── topics.js                  # רשימת כל הנושאים + רוטציה
    └── test-connection.js         # בדיקת חיבורים
```

---

## 🔧 טיפול בתקלות

### מאמר לא פורסם
1. לך ל-Actions → לחץ על הריצה האחרונה
2. הורד את ה-Artifact `publish-log-XXXXX`
3. פתח את `last-run.log`

### שגיאת WordPress 401
- בדוק שה-`WP_APP_PASSWORD` הוא **Application Password** (לא סיסמת WP רגילה)
- ב-WP Admin: **Users → Edit Profile → Application Passwords → הוסף חדש**

### שגיאת Claude 401
- בדוק שה-`CLAUDE_API_KEY` תקין ב-Anthropic Console
- ודא שיש קרדיט בחשבון

---

## 📈 לוח זמנים

```
UTC  03:00 → ישראל 06:00 → מאמר #1
UTC  10:00 → ישראל 13:00 → מאמר #2
UTC  17:00 → ישראל 20:00 → מאמר #3
```

הרוטציה: 64 נושאים ÷ 3 ביום ≈ **21 יום** לסבב מלא אחד.
