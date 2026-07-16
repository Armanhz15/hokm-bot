// handlers/message.js
// دستورات متنی: /start، باز کردن Mini App، خرید سکه
// قرارداد Telegram Serverless: export default async function (ctx) {}

const { users } = require('../schema');
const { purchaseWithStars } = require('../lib/wallet');

module.exports = async function message(ctx) {
  const msg = ctx.message;
  if (!msg || !msg.text) return;

  const from = msg.from;
  const userId = from.id;
  const text = msg.text.trim();

  // ثبت/به‌روزرسانی کاربر
  const existing = await ctx.db.select(users).where('id', userId).first();
  if (!existing) {
    await ctx.db.insert(users, {
      id: userId,
      username: from.username || null,
      firstName: from.first_name || null,
      coins: 0,
      createdAt: Date.now(),
    });
  }

  if (text === '/start') {
    return ctx.reply(
      'بازی حکم 🃏\nبرای شروع روی دکمه زیر بزن:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎮 بازی کن', web_app: { url: process.env.WEBAPP_URL || 'https://your-webapp-url' } }],
          ],
        },
      }
    );
  }

  if (text.startsWith('/buy')) {
    // فرمت: /buy 100  (تعداد سکه؛ مبلغ Stars توسط پلتفرم تعیین می‌شود)
    const coins = parseInt(text.split(' ')[1], 10) || 0;
    if (coins <= 0) return ctx.reply('تعداد سکه نامعتبر است. مثال: /buy 100');
    // در tgcloud واقعی: ساخت Stars invoice و ارسال لینک پرداخت
    // اینجا فقط ثبت اولیه (idempotent با invoiceId که بعداً می‌آید)
    return ctx.reply(
      `برای خرید ${coins} سکه از طریق Telegram Stars روی دکمه بزن:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: `⭐ خرید ${coins} سکه`, callback_data: `buy_${coins}` }],
          ],
        },
      }
    );
  }

  if (text === '/balance') {
    const row = await ctx.db.select(users).where('id', userId).first();
    return ctx.reply(`موجودی شما: ${row ? row.coins : 0} سکه 🪙`);
  }
};
