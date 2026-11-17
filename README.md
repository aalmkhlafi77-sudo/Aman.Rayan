# AMAN — أمان (Secure Digital Vault v2.0.1)

خزنة رقمية خاصة وآمنة باللغة العربية لحفظ كلمات المرور، حسابات المواقع، مفاتيح API، الرموز (Tokens)، المفاتيح السرية، تراخيص البرامج، الشهادات، والروابط الحساسة.

**تصميم : عبدالله المخلافي 2026**

## البنية المعمارية المزدوجة

- **وضع المعاينة (`VITE_APP_MODE=preview`)**: يستخدم `PreviewDataAdapter` مع قاعدة بيانات IndexedDB محلية داخل المتصفح لاختبار كافة المزايا التفاعلية داخل Google AI Studio دون الحاجة لخادم MySQL.
- **وضع الإنتاج (`VITE_APP_MODE=production`)**: يستخدم `ApiDataAdapter` المتصل بخادم Node.js / Express وقاعدة بيانات MySQL أو MariaDB عبر استعلامات SQL مُعامَلة (`Parameterized`) ومعاملات ذرية (`Transactions`).

## الأمان والتشفير

- **التحقق من الرمز في الإنتاج**: يتم التحقق من رمز PIN المكوّن من 6 أرقام عبر `POST /api/auth/unlock` فوق HTTPS ومقارنته بمُتحقق PBKDF2-SHA256 المخزن في `owner_security` مع إصدار جلسة `HttpOnly` محمية بـ CSRF.
- **تشفير من جهة العميل**: تُشفّر جميع الحقول الحساسة محلياً عبر Web Crypto (`AES-256-GCM`) بصيغة `ENC:IV:CIPHERTEXT` قبل أي طلب `POST` أو `PUT` إلى الخادم.
- **النسخ الاحتياطي (`.aman`)**: يدعم التصدير والاستيراد المشفر بصيغة `AMAN_ENCRYPTED_VAULT` (الإصدار `2.0.0`).
- **أدوات Excel (`.xlsx`)**: تصدير واستيراد مصنفات `.xlsx` حقيقية مع شاشة معاينة وفحص قبل التنفيذ الذري.

## النشر على استضافة Node.js (مثل Hostinger)

1. انسخ ملف البيئة وأعد ضبط المتغيرات الحقيقية في `.env`:
   ```bash
   cp .env.example .env
   ```
   اضبط `VITE_APP_MODE=production` وبيانات MySQL (`DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) و `PUBLIC_ORIGIN` و `SESSION_SECRET`.
2. أنشئ قاعدة البيانات ونفّذ ملف الجداول الآمن (أو اترك الخادم ينشئها تلقائياً عند التشغيل دون حذف أي بيانات موجودة):
   ```bash
   mysql -u USER -p aman < database/schema.sql
   ```
3. ثبّت الحزم وابنِ التطبيق ثم شغّل الخادم:
   ```bash
   npm install
   npm run build
   npm start
   ```
