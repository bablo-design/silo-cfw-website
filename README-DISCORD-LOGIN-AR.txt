SILO CFW — تسجيل الدخول بحساب Discord قبل التفعيل

المضاف في هذه النسخة:
- لا تظهر أسئلة التفعيل قبل تسجيل الدخول بديسكورد.
- حساب الديسكورد يُجلب مباشرة من Discord ولا يستطيع المتقدم تزويره.
- الطلب المرسل للإدارة يحتوي اسم حساب Discord وDiscord ID.
- السيرفر يرفض أي طلب يصل بدون جلسة Discord صحيحة.
- متابعة حالة الطلب تحتاج تسجيل الدخول بنفس الحساب الذي قدّم الطلب.
- الجلسة تعمل لمدة 7 أيام داخل Cookie آمن HttpOnly.

==================================================
1) Discord Developer Portal
==================================================

افتح تطبيق SILO Whitelist ثم:

OAuth2 > General

داخل Redirects أضف الرابط التالي بالضبط:

https://silo-cfw.netlify.app/.netlify/functions/auth-callback

ثم اضغط Save Changes.

بنفس صفحة OAuth2 انسخ Client Secret.
ملاحظة: Client Secret يختلف عن Bot Token ولا يجب نشره.

Application ID الموجود في General Information هو:
DISCORD_CLIENT_ID

==================================================
2) أضف متغيرات Netlify الجديدة
==================================================

أضف هذه المتغيرات إلى المتغيرات الموجودة عندك:

DISCORD_CLIENT_ID=Application ID
DISCORD_CLIENT_SECRET=Client Secret من OAuth2
AUTH_SESSION_SECRET=مفتاح سري طويل وعشوائي

مثال لمفتاح AUTH_SESSION_SECRET بطول مناسب:
357befb6e8247be5b7b49187cda52f3756c334f1d8a4ee138d7576cc6dcdb2be

الأفضل تولّد قيمة جديدة خاصة بك، ولا ترسلها لأي شخص.

خليها:
- Contains secret values: مفعّل
- Scope: Functions
- Deploy context: Production

بعد الحفظ:
Deploys > Trigger deploy > Deploy project

==================================================
3) الملفات الجديدة المهمة
==================================================

netlify/functions/auth-discord.mjs
netlify/functions/auth-callback.mjs
netlify/functions/auth-me.mjs
netlify/functions/auth-logout.mjs
netlify/functions/_auth.mjs

لا تحذف أي واحد منها.

==================================================
4) الاختبار
==================================================

1. افتح الموقع وسوِ Ctrl + F5.
2. انزل إلى تقديم التفعيل.
3. يجب أن يظهر زر "تسجيل الدخول بديسكورد" بدلاً من الأسئلة.
4. اضغط الزر ووافق داخل Discord.
5. يرجعك للموقع ويظهر اسم حسابك وDiscord ID.
6. بعدها فقط تظهر أسئلة التفعيل.
7. أكمل الطلب وأرسله.
8. الطلب الواصل إلى روم الإدارة يحتوي حساب Discord الحقيقي المرتبط.

==================================================
مهم جداً
==================================================

لا تضع القيم التالية داخل GitHub أو index.html:
DISCORD_BOT_TOKEN
DISCORD_CLIENT_SECRET
AUTH_SESSION_SECRET

كلها تبقى داخل Environment variables في Netlify فقط.
