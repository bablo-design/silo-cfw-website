SILO CFW — نظام التفعيل مع مراجعة Discord

المميزات:
- الطلب ينرسل إلى روم محدد في Discord.
- رسالة الطلب تحتوي زر قبول وزر رفض.
- لا يستطيع استخدام الأزرار إلا رتبة المشرفين المحددة.
- حالة الطلب تُحفظ في Netlify Blobs.
- الموقع يفحص الحالة تلقائياً ويعرض:
  قيد المراجعة / مقبول / مرفوض.
- توكن البوت لا يظهر داخل ملفات الموقع العامة.

==================================================
1) إنشاء بوت Discord
==================================================

1. افتح Discord Developer Portal.
2. أنشئ Application جديدة باسم SILO Whitelist.
3. من صفحة Bot أنشئ البوت.
4. انسخ Bot Token وخزنه عندك فقط.
   لا تضعه داخل index.html ولا ترسله لأي شخص.
5. من صفحة General Information انسخ Public Key.
6. أضف البوت إلى سيرفرك بهذه الصلاحيات:
   View Channel
   Send Messages
   Embed Links
   Attach Files
   Read Message History

==================================================
2) المعلومات المطلوبة
==================================================

DISCORD_BOT_TOKEN
توكن البوت — سري جداً.

DISCORD_PUBLIC_KEY
Public Key الموجود في General Information.

DISCORD_CHANNEL_ID
آيدي روم طلبات التفعيل.

DISCORD_REVIEWER_ROLE_ID
آيدي رتبة المشرفين المسموح لها بالقبول والرفض.
إذا تركته فارغاً، يُسمح فقط لمن يملك Administrator أو Manage Server.

لتفعيل نسخ الآيدي:
Discord > User Settings > Advanced > Developer Mode
بعدها اضغط يمين على الروم أو الرتبة واختر Copy ID.

==================================================
3) رفع الموقع
==================================================

هذا النظام يحتوي Netlify Functions وحزم npm.
لا يكفي رفعه بطريقة Drag & Drop القديمة، لأن الرفع اليدوي لا يشغل build command.

الطريقة المفضلة:
- ارفع المجلد إلى GitHub.
- من Netlify اختر Add new project > Import an existing project.
- اربط مستودع GitHub.
- اترك Build command فارغاً.
- Publish directory: .
- اعمل Deploy.

أو استخدم Netlify CLI:
npm install
npx netlify login
npx netlify link
npx netlify deploy --build --prod

==================================================
4) إضافة المتغيرات السرية في Netlify
==================================================

Netlify:
Project configuration > Environment variables

أضف:
DISCORD_BOT_TOKEN
DISCORD_PUBLIC_KEY
DISCORD_CHANNEL_ID
DISCORD_REVIEWER_ROLE_ID

بعد إضافتها اعمل Redeploy للموقع.

==================================================
5) ربط Discord Interactions
==================================================

بعد نشر الموقع، انسخ هذا الرابط مع استبدال رابط موقعك:

https://YOUR-SITE.netlify.app/.netlify/functions/discord-interactions

في Discord Developer Portal:
General Information > Interactions Endpoint URL

الصق الرابط واضغط Save.
Discord سيرسل اختبار PING، والدالة ترد عليه وتتحقق من التوقيع.

==================================================
6) الاختبار
==================================================

1. افتح الموقع.
2. أكمل طلب التفعيل.
3. اضغط تأكيد الطلب.
4. يجب أن تصل رسالة إلى روم الإدارة.
5. اضغط قبول أو رفض من حساب يملك رتبة المشرف.
6. ارجع للموقع واضغط تحديث حالة الطلب أو انتظر 15 ثانية.

ملاحظة:
المتقدم يعرف النتيجة من نفس المتصفح الذي قدّم منه لأن رقم الطلب
والتوكن الخاص به محفوظان محلياً داخل المتصفح.
