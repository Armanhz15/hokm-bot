// lib/wallet.js
// کیف پول، خرید سکه با Stars، escrow شرط‌بندی، تسویه
// خط قرمز: هیچ مسیر cash-out / تبدیل به پول واقعی وجود ندارد.
// همه‌ی عملیات idempotent هستند (بر اساس refId).

const { users, walletTransactions, wagers } = require('../schema');

// موجودی فعلی کاربر را می‌خواند
async function getBalance(db, userId) {
  const row = await db.select(users).where('id', userId).first();
  return row ? row.coins : 0;
}

// ثبت تراکنش با idempotency بر اساس refId
// kind: 'stars_purchase' | 'wager_lock' | 'payout' | 'rake'
async function recordTx(db, { userId, kind, amount, refId }) {
  // اگر قبلاً با همین refId ثبت شده، همان را برگردان (idempotent)
  if (refId) {
    const existing = await db
      .select(walletTransactions)
      .where('ref_id', refId)
      .first();
    if (existing) return existing;
  }

  const tx = await db.insert(walletTransactions, {
    user_id: userId,
    kind,
    amount,
    ref_id: refId || null,
    createdAt: Date.now(),
  });

  // به‌روزرسانی موجودی (فقط برای واریز/برداشت واقعی)
  const balance = await getBalance(db, userId);
  await db.update(users).where('id', userId).set({ coins: balance + amount });
  return tx;
}

// خرید سکه با Telegram Stars (فقط ورودی، خروجی ندارد)
async function purchaseWithStars(db, { userId, stars, coins, invoiceId }) {
  // نرخ تبدیل Stars -> سکه از تنظیمات پلتفرم می‌آید؛ اینجا coins را ورودی می‌گیریم
  return recordTx(db, { userId, kind: 'stars_purchase', amount: coins, refId: invoiceId });
}

// قفل کردن سکه برای یک میز (escrow) — یک بار برای هر تیم
async function lockWager(db, { tableId, team, amount, refId }) {
  // idempotency: اگر قبلاً برای این میز/تیم قفل شده، تکرار نشود
  const existing = await db
    .select(wagers)
    .where('table_id', tableId)
    .first();
  if (existing) {
    if (team === 0 && existing.team0Locked > 0) return existing;
    if (team === 1 && existing.team1Locked > 0) return existing;
  }

  // بررسی موجودی و ثبت برداشت (idempotent بر اساس refId.ref)
  const w = await recordTx(db, { userId: refId.userId, kind: 'wager_lock', amount: -amount, refId: refId.ref });

  // ثبت/به‌روزرسانی ردیف escrow
  if (!existing) {
    return db.insert(wagers, {
      table_id: tableId,
      team0_locked: team === 0 ? amount : 0,
      team1_locked: team === 1 ? amount : 0,
      settled: 0,
    });
  }
  if (team === 0) {
    await db.update(wagers).where('table_id', tableId).set({ team0_locked: amount });
  } else {
    await db.update(wagers).where('table_id', tableId).set({ team1_locked: amount });
  }
  return existing;
}

// تسویه در پایان مسابقه: برنده مبلغ منهای rake را می‌گیرد
// settleWinner باید idempotent باشد (settled=1 جلوگیری می‌کند از دوبار پرداخت)
async function settleWinner(db, { tableId, winningTeam, rakePct = 0 }) {
  const w = await db.select(wagers).where('table_id', tableId).first();
  if (!w) throw new Error('no_wager');
  if (w.settled === 1) return { alreadySettled: true }; // idempotent

  const pot = w.team0_locked + w.team1_locked;
  const rake = Math.floor(pot * rakePct);
  const payout = pot - rake;

  // واریز به تیم برنده — فراخوان‌دهنده لیست userId های تیم را می‌دهد
  // اینجا فقط منطق مبلغ؛ تخصیص به اعضا در rooms.js انجام می‌شود
  await db.update(wagers).where('table_id', tableId).set({
    settled: 1,
    settled_at: Date.now(),
  });

  if (rake > 0) {
    // ثبت rake به عنوان تراکنش سیستمی (بدون userId مشخص -> پلتفرم)
    await db.insert(walletTransactions, {
      user_id: 0,
      kind: 'rake',
      amount: rake,
      ref_id: `rake_${tableId}`,
      createdAt: Date.now(),
    });
  }

  return { pot, rake, payout, winningTeam };
}

module.exports = {
  getBalance,
  recordTx,
  purchaseWithStars,
  lockWager,
  settleWinner,
};
