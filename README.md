# حکم‌بوت (Hokm Bot) — راهنمای دیپلوی

بازی چندنفره‌ی حکم روی تلگرام به‌صورت Telegram Mini App با بک‌اند Serverless.
بک‌اند مستقیماً روی زیرساخت تلگرام (Telegram Serverless / tgcloud) اجرا می‌شود.

---

## ۱. پیش‌نیازها

> ⚠️ **نکته مهم:** چون مستندات دقیق `tgcloud` در دسترس نبود، این راهنما بر اساس
> «قرارداد عمومی Serverless» نوشته شده. بخش‌هایی که با مستندات رسمی باید چک شوند
> با علامت 🔍 مشخص شده‌اند. قبل از دیپلوی حتماً مستندات پلتفرم را بخوانید.

- Node.js 18+ (برای اجرای تست‌های محلی)
- یک بات تلگرام (از @BotFather توکن بگیرید)
- حساب Telegram Stars فعال (برای پرداخت داخلی)
- دسترسی به پلتفرم tgcloud

---

## ۲. ساختار پروژه

```
hokm_bot/
├─ schema.js                  # تعریف جداول (DSL شبیه Drizzle)
├─ handlers/                   # هندلرهای آپدیت تلگرام (flat)
│  ├─ message.js               # دستورات متنی: /start, /buy, /balance
│  ├─ callback_query.js        # دکمه‌های این‌لاین
│  └─ api.js                   # اندپوینت Mini App (HTTP از داخل وب‌اپ)
├─ lib/                        # منطق قابل استفاده‌ی مجدد
│  ├─ deck.js                   # شافل، تقسیم کارت، تعیین حاکم
│  ├─ rules.js                  # اعتبارسنجی حرکت، تشخیص برنده
│  ├─ scoring.js                # امتیازدهی هر کد
│  ├─ rooms.js                  # اتاق خصوصی/عمومی، escrow، تسویه، لیدربورد
│  ├─ wallet.js                 # کیف پول (idempotent، بدون cash-out)
│  └─ engine.js                 # موتور بازی (state-based، serializable)
├─ webapp/                     # فایل‌های Mini App (جدا هاست می‌شود)
│  ├─ index.html
│  ├─ style.css
│  └─ app.js
├─ test/                       # تست‌ها (قابل اجرا بدون دیپلوی)
├─ server.js                   # سرور لوکال تست (روی tgcloud نیاز نیست)
└─ node_modules/sdk/db.js      # STUB محلی — 🔍 روی tgcloud حذف شود
```

---

## ۳. نحوه‌ی اجرای تست‌های محلی

هیچ نیازی به دیپلوی نیست؛ منطق بازی را می‌توان بدون پلتفرم تست کرد:

```bash
# نصب نیست (هیچ پکیج خارجی نداریم) — فقط Node خام
node test/rules.test.js
node test/logic.test.js
node test/engine.test.js
node test/integration.test.js
node test/wallet_flow.test.js
node test/history.test.js
```

یا همه با هم:

```bash
for f in test/*.test.js; do node "$f"; done
```

همه‌ی تست‌ها باید سبز شوند (۳۴ تست).

---

## ۴. اجرای نسخه‌ی محلی (دمو بدون tgcloud)

یک سرور محلی برای تست یکپارچه Mini App + API فراهم شده:

```bash
node server.js
# باز کنید: http://localhost:3000
# initData=1 به عنوان کاربر دمو در نظر گرفته می‌شود
```

این فقط برای تست لوکال است و روی پلتفرم Serverless اجرا نمی‌شود.

---

## ۵. تطبیق با پلتفرم Telegram Serverless 🔍

قبل از دیپلوی، این موارد را با مستندات رسمی tgcloud چک کنید:

### ۵.۱. Importهای پلتفرم

کد از importهای bare استفاده می‌کند:

```js
const { defineTable, integer, text, real } = require('sdk/db');
```

روی پلتفرم واقعی، این ماژول توسط خود tgcloud تأمین می‌شود.
فایل **`node_modules/sdk/db.js`** فقط یک stub محلی برای اجرای تست است.

✅ **اقدام:** قبل از دیپلوی، پوشه `node_modules/` را حذف کنید (یا
در `.gitignore` / فایل دیپلوی پلتفرم نادیده بگیرید).

### ۵.۲. قرارداد هندلرها

طبق قرارداد Serverless، هر فایل در `handlers/` یک آپدیت تلگرام را هندل می‌کند:

```js
module.exports = async function update(ctx) {
  // ctx شامل: ctx.message / ctx.callbackQuery / ctx.request / ctx.db / ...
}
```

🔍 طبق مستندات رسمی، نام دقیق تابع export و ساختار `ctx` را تأیید کنید.
احتمالاً یک تابع `router` یا فایل `index.js` در ریشه لازم است که آپدیت را
به هندلر مناسب هدایت کند.

### ۵.۳. احراز هویت Mini App (initData)

در `handlers/api.js` تابع `authUser` آمده:

```js
async function authUser(ctx) {
  const initData = ctx.request.body.initData || ctx.request.headers['x-init-data'];
  if (!initData) throw new Error('unauthorized');
  // 🔍 روی پلتفرم واقعی:
  // const u = await sdk.validateInitData(initData);
  // return u.id;
  const userId = parseInt(initData, 10); // دمو لوکال
  return userId;
}
```

✅ **اقدام:** خط بالا را با `sdk.validateInitData` جایگزین کنید.
این خط قرمز امنیتی است — بدون آن هر کسی می‌تواند جای بقیه بازی کند.

### ۵.۴. پرداخت با Telegram Stars

خرید سکه از طریق Stars انجام می‌شود. روی پلتفرم واقعی:

1. سرور یک Stars Invoice می‌سازد (از طریق `sdk/api`).
2. تلگرام پس از پرداخت موفق، آپدیت `successful_payment` می‌فرستد.
3. در `handlers/message.js` (یا یک هندلر پرداخت) آن را پردازش کنید:

```js
// مثال (🔍 با مستندات واقعی تطبیق دهید)
if (ctx.message && ctx.message.successful_payment) {
  const payment = ctx.message.successful_payment;
  await purchaseWithStars(ctx.db, {
    userId: ctx.message.from.id,
    stars: payment.total_amount,
    coins: payment.total_amount, // یا نرخ تبدیل از تنظیمات
    invoiceId: payment.telegram_payment_charge_id,
  });
}
```

### ۵.۵. میزبانی فایل‌های Mini App

طبق قرارداد، Serverless فقط API می‌دهد؛ فایل‌های `webapp/` را جدا هاست کنید:

- 🔍 طبق مستندات tgcloud، احتمالاً یک دستور مثل `tgcloud deploy --webapp webapp/`
  یا آپلود به یک فضای ثابت وجود دارد.
- آدرس نهایی را در متغیر محیطی `WEBAPP_URL` تنظیم کنید (در `handlers/message.js`
  و `handlers/callback_query.js` استفاده می‌شود).

---

## ۶. مراحل دیپلوی (شماتیک) 🔍

```bash
# ۱. ورود به پلتفرم
npx tgcloud login

# ۲. ساخت پروژه (اگر نشده)
npm create @tgcloud/bot hokm_bot   # یا دستور معادل پلتفرم

# ۳. همگام‌سازی کد
#    فایل‌های handlers/, lib/, schema.js را کپی کنید

# ۴. اعمال schema (جدا از push)
npx tgcloud db migrate     # 🔍 نام دقیق دستور را چک کنید
#    (تغییرات schema با migrate اعمال می‌شود، نه با push)

# ۵. دیپلوی
npx tgcloud deploy

# ۶. هاست Mini App
npx tgcloud deploy --webapp webapp/   # 🔍 چک کنید

# ۷. تنظیم متغیرهای محیطی
#    WEBAPP_URL  -> آدرس Mini App
#    WAGER_RAKE_PCT -> درصد کارمزد پلتفرم (مثلاً 0.05 برای ۵٪)
```

---

## ۷. تنظیمات محیطی

| متغیر | توضیح | پیش‌فرض |
|-------|-------|---------|
| `WEBAPP_URL` | آدرس Mini App | `https://your-webapp-url` |
| `WAGER_RAKE_PCT` | درصد کارمزد پلتفرم از هر شرط | `0` |

---

## ۸. نکات حقوقی (خط قرمز)

✅ رعایت شده در کد:
- سکه **فقط** با Telegram Stars خریداری می‌شود (`purchaseWithStars`).
- **هیچ مسیر cash-out وجود ندارد** — سکه فقط داخل بازی معتبر است و
  هرگز به پول واقعی تبدیل نمی‌شود.
- در `lib/wallet.js` هیچ تابعی برای برداشت خارجی / تبدیل به پول واقعی نیست.
- تسویه (`settleWinner` / `settleTableWagers`) فقط دوباره به کیف پول
  **داخلی** واریز می‌کند.
- همه‌ی تراکنش‌ها idempotent هستند (بر اساس `ref_id` / `invoice_id`) تا
  در صورت ری‌ترای شبکه، پول دوبار جابه‌جا نشود.

⚠️ قبل از انتشار، حتماً با مشاور حقوقی چک کنید که مدل شرط‌بندی با
مقررات منطقه‌ی هدف سازگار باشد.

---

## ۹. معماری همگام‌سازی

طبق درخواست، فعلاً از **polling ساده** (هر ۱.۵ ثانیه) استفاده شده:

- کلاینت (`webapp/app.js`) هر ۱.۵ ثانیه وضعیت میز را از `GET_STATE` می‌گیرد.
- برای ارتقاء به real-time، فقط تابع `pollOnce`/`startPolling` در `app.js`
  را با یک لایه‌ی WebSocket جایگزین کنید؛ بقیه‌ی کد دست‌نخورده می‌ماند.
- وضعیت کامل میز در جدول `rounds` (ستون `state_json`) ذخیره می‌شود،
  پس ری‌لود کلاینت state را از دست نمی‌دهد.

---

## ۱۰. نقاطی که باید با مستندات tgcloud نهایی شوند 🔍

- [ ] نام دقیق ماژول‌های پلتفرم (`sdk`, `sdk/db`, `sdk/api`, `sdk/fetch`)
- [ ] ساختار دقیق `ctx` در هندلرها
- [ ] نحوه‌ی export و روتینگ هندلرها (یک تابع در ریشه؟ فایل جدا؟)
- [ ] دستور دقیق migrate/push برای schema
- [ ] نحوه‌ی میزبانی و آدرس‌دهی Mini App
- [ ] فرمت دقیق آپدیت `successful_payment` و ساخت Stars Invoice
- [ ] توابع `sdk.validateInitData` و `sdk.api`
