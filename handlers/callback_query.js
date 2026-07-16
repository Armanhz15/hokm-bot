// handlers/callback_query.js
// دکمه‌های این‌لاین: خرید سکه، پیوستن به میز
// قرارداد Telegram Serverless: export default async function (ctx) {}

const { users } = require('../schema');
const { createPrivateTable, joinPrivateTable, joinPublicQueue } = require('../lib/rooms');
const { purchaseWithStars } = require('../lib/wallet');

const WEBAPP_URL = process.env.WEBAPP_URL || 'https://your-webapp-url';

module.exports = async function callbackQuery(ctx) {
  const cb = ctx.callbackQuery;
  if (!cb) return;
  const data = cb.data;
  const userId = cb.from.id;

  // تایید دکمه (جلوگیری از چرخاندن ساعت)
  await ctx.answerCallbackQuery();

  if (data.startsWith('buy_')) {
    const coins = parseInt(data.split('_')[1], 10);
    // در tgcloud واقعی: اینجا Stars invoice ساخته می‌شود. فعلاً سناریوی تست:
    // بعد از پرداخت موفق، تلگرام وب‌هوک pre_checkout / successful_payment می‌فرستد
    // که در message.js (نوع successful_payment) پردازش می‌شود.
    // برای دمو، ثبت مستقیم با invoiceId فرضی (idempotent):
    const invoiceId = `stars_${userId}_${coins}_${Date.now()}`;
    await purchaseWithStars(ctx.db, { userId, stars: coins, coins, invoiceId });
    const row = await ctx.db.select(users).where('id', userId).first();
    return ctx.editMessageText(`✅ ${coins} سکه خریداری شد. موجودی: ${row.coins} 🪙`);
  }

  if (data === 'create_private') {
    const t = await createPrivateTable(ctx.db, { userId });
    return ctx.editMessageText(
      `اتاق خصوصی ساخته شد 🔐\nکد: ${t.code}\nلینک دعوت: ${WEBAPP_URL}?table=${t.code}\nمنتظر ۳ بازیکن دیگر...`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎮 ورود به میز', web_app: { url: `${WEBAPP_URL}?table=${t.code}` } }],
          ],
        },
      }
    );
  }

  if (data === 'join_public') {
    const res = await joinPublicQueue(ctx.db, { userId });
    if (res.started) {
      return ctx.editMessageText('✅ ۴ نفر جمع شدند! میز عمومی ساخته شد. وارد شو:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎮 ورود به میز', web_app: { url: WEBAPP_URL } }],
          ],
        },
      });
    }
    return ctx.editMessageText('⏳ در صف مچ‌میکینگ هستی... منتظر بازیکنان دیگر.');
  }

  if (data.startsWith('join_code_')) {
    const code = data.split('join_code_')[1];
    try {
      const t = await joinPrivateTable(ctx.db, { userId, code });
      return ctx.editMessageText(`✅ به میز ${code} پیوستی.`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎮 ورود به میز', web_app: { url: `${WEBAPP_URL}?table=${t.code}` } }],
          ],
        },
      });
    } catch (e) {
      return ctx.editMessageText('❌ ' + e.message);
    }
  }
};
