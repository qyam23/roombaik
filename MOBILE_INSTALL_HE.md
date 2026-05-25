# התקנת RoomSense AI Private במחשב ובטלפון

המחשב משמש כשרת מקומי בבית. הטלפון Samsung A56 5G מתחבר אליו דרך אותה רשת Wi-Fi ומשתמש בדפדפן כדי להפעיל מצלמה ומיקרופון באישור גלוי.

## 1. התקנה במחשב

1. התקן Node.js 20 ומעלה.
2. הורד או שכפל את הריפו למחשב.
3. פתח את תיקיית הפרויקט.
4. לחץ דאבל-קליק על:

```text
run-local.cmd
```

הקובץ יבצע אוטומטית:

- התקנת חבילות אם חסר `node_modules`.
- יצירת `.env.local` אם הוא לא קיים.
- יצירת `ROOMSENSE_ACCESS_KEY` אקראי מקומי.
- בניית גרסת production.
- הפעלת שרת HTTP למחשב ושרת HTTPS לטלפון.

חשוב להשאיר את חלון ה-CMD פתוח כל עוד האפליקציה רצה.

## 2. כתובות שהמחשב ידפיס

במחשב:

```text
http://localhost:3000/?access_key=YOUR_LOCAL_ACCESS_KEY
```

בטלפון, באותה רשת Wi-Fi, יופיע קישור בסגנון:

```text
https://YOUR-PC-IP:3443/?access_key=YOUR_LOCAL_ACCESS_KEY
```

החלק `access_key` הוא מפתח החיבור בין הטלפון לשרת המקומי. הוא נוצר אצלך במחשב ונשמר רק ב-`.env.local`, שאינו עולה ל-GitHub.

## 3. חיבור הטלפון

1. חבר את הטלפון Samsung A56 5G לאותה רשת Wi-Fi של המחשב.
2. פתח Chrome בטלפון.
3. הדבק את כתובת ה-HTTPS שהופיעה בחלון ההפעלה.
4. אם Chrome מציג אזהרת certificate, המשך רק אם ה-IP הוא של המחשב שלך.
5. כשהאפליקציה נטענת, המפתח נשמר בדפדפן של הטלפון.
6. לחץ `Initialize Sensor`.
7. אשר הרשאות מצלמה ומיקרופון.

Android דורש HTTPS כדי לאפשר מצלמה ומיקרופון דרך כתובת IP ברשת המקומית. לכן `run-local.cmd` מפעיל גם שרת HTTPS בפורט `3443`.

## 4. איך המפתח עובד

השרת בודק כל בקשת `/api/*` מול `ROOMSENSE_ACCESS_KEY`.

הטלפון מקבל את המפתח דרך הקישור:

```text
?access_key=...
```

האפליקציה שומרת אותו ב-localStorage ושולחת אותו בכל קריאת API באמצעות header:

```text
X-RoomSense-Key
```

אין לשים את המפתח האמיתי בקובץ Markdown או בקומיט. אם צריך מפתח חדש, מחק את השורה `ROOMSENSE_ACCESS_KEY=...` מתוך `.env.local` והרץ שוב את `run-local.cmd`.

## 5. מצב AI

ברירת המחדל היא מצב פרטי מקומי:

- אין Google API.
- אין Gemini API.
- אין שליחת תמונות או לוגים החוצה.

אם בעתיד תרצה ספק AI חיצוני או שרת AI מקומי שתואם OpenAI API, מלא ב-`.env.local`:

```env
AI_API_BASE_URL=http://localhost:11434/v1
AI_API_KEY=ollama
AI_MODEL=llava:latest
AI_PROVIDER_LABEL=Local Ollama
```

לאחר מכן פתח Settings באפליקציה והפעל External AI.

## 6. בדיקה מהירה

במחשב:

```text
http://localhost:3000/?access_key=YOUR_LOCAL_ACCESS_KEY
```

בטלפון:

```text
https://YOUR-PC-IP:3443/?access_key=YOUR_LOCAL_ACCESS_KEY
```

אם הטלפון לא מתחבר:

- ודא שהמחשב והטלפון באותה רשת Wi-Fi.
- ודא שחלון `run-local.cmd` עדיין פתוח.
- ודא ש-Windows Firewall מאפשר ל-Node.js גישה לרשת פרטית.
- נסה לפתוח במחשב את `http://localhost:3000` כדי לוודא שהשרת חי.
