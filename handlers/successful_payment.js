// handlers/successful_payment.js
// پرداخت موفق Telegram Stars -> واریز سکه به کیف پول
// قرارداد Telegram Serverless: export default async function (ctx) {}
//
// 🔍 نام دقیق فیلدها را با مستندات رسمی tgcloud چک کنید.
// ساختار زیر طبق قرارداد عمومی آپدات تلگرام است.

const { purchaseWithStars } = require('../lib/wallet');

module.exports = async function successfulPayment(ctx) {
  const payment = ctx.message && ctx.message.successful_payment;
  if (!payment) return;

  const userId = ctx.message.from.id;
  // نرخ تبدیل Stars -> سکه از تنظیمات پلتفرم می‌آید؛ اینجا ۱:۱ فرض شده
  const stars = payment.total_amount;
  const coins = stars;
  const invoiceId = payment.telegram_payment_charge_id;

  // idempotent: در صورت ری‌ترای تلگرام، دوبار واریز نمی‌شود
  await purchaseWithStars(ctx.db, { userId, stars, coins, invoiceId });

  return ctx.reply(`✅ ${coins} سکه با موفقیت خریداری شد 🪙`);
};
