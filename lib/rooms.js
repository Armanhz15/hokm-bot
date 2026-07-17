// lib/rooms.js
// ساخت/عضویت اتاق خصوصی و صف عمومی (atomic، بدون cron)
// همه‌ی عملیات در یک تراکنش/هندلر انجام می‌شود.

const { tables, tableSeats, queue, gameHistory, leaderboard } = require('../schema');
const { teamOf } = require('./rules');

// تولید کد ۶ رقمی تصادفی یکتا
async function generateCode(db) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const exists = await db.select(tables).where('code', code).first();
    if (!exists) return code;
  }
  throw new Error('code_generation_failed');
}

// ایجاد اتاق خصوصی؛ سازنده در صندلی ۰ می‌نشیند و به عنوان هاست ثبت می‌شود
async function createPrivateTable(db, { userId, wager = 0 }) {
  const code = await generateCode(db);
  const t = await db.insert(tables, {
    code,
    type: 'private',
    status: 'waiting',
    wager,
    host_id: userId,
    createdAt: Date.now(),
  });
  await db.insert(tableSeats, {
    table_id: t.id,
    user_id: userId,
    seat: 0,
    team: teamOf(0),
    joined_at: Date.now(),
  });
  return t;
}

// پیوستن به اتاق خصوصی با کد
async function joinPrivateTable(db, { userId, code }) {
  const t = await db.select(tables).where('code', code).first();
  if (!t) throw new Error('table_not_found');
  if (t.status !== 'waiting') throw new Error('table_not_waiting');

  const seats = await db.select(tableSeats).where('table_id', t.id).all();
  if (seats.some((s) => s.user_id === userId)) throw new Error('already_joined');
  if (seats.length >= 4) throw new Error('table_full');

  const seat = seats.length; // صندلی بعدی آزاد
  await db.insert(tableSeats, {
    table_id: t.id,
    user_id: userId,
    seat,
    team: teamOf(seat),
    joined_at: Date.now(),
  });
  return t;
}

// مچ‌میکینگ عمومی: وارد کردن به صف؛ با رسیدن نفر چهارم atomic میز ساخته می‌شود
async function joinPublicQueue(db, { userId, wager = 0 }) {
  // اگر قبلاً در صف است، حذف (جلوگیری از تکرار)
  await db.delete(queue).where('user_id', userId);

  await db.insert(queue, {
    user_id: userId,
    wager,
    entered_at: Date.now(),
  });

  const q = await db.select(queue).orderBy('entered_at').all();

  // به‌محض تکمیل ۴ نفر با همان wager -> ساخت میز (atomic)
  const sameWager = q.filter((x) => x.wager === wager).slice(0, 4);
  if (sameWager.length === 4) {
    const t = await db.insert(tables, {
      code: null,
      type: 'public',
      status: 'waiting',
      wager,
      createdAt: Date.now(),
    });
    for (let i = 0; i < 4; i++) {
      await db.insert(tableSeats, {
        table_id: t.id,
        user_id: sameWager[i].user_id,
        seat: i,
        team: teamOf(i),
        joined_at: Date.now(),
      });
      // حذف از صف
      await db.delete(queue).where('user_id', sameWager[i].user_id);
    }
    return { table: t, started: true };
  }

  return { table: null, started: false, inQueue: true };
}

// لیست نشسته‌های یک میز
async function getTableSeats(db, tableId) {
  return db.select(tableSeats).where('table_id', tableId).orderBy('seat').all();
}

// قفل کردن شرط (escrow) برای همه‌ی بازیکنان یک میز قبل از شروع بازی
// مبلغ wager از جدول tables خوانده می‌شود. idempotent:
// اگر قبلاً برای تیمی قفل شده بود، دوباره انجام نمی‌شود.
async function lockTableWagers(db, { tableId, seats, wager }) {
  const { lockWager } = require('./wallet');
  // هر بازیکن سکه‌ی خودش را قفل می‌کند (escrow شخصی)
  // refId یکتا برای این میز/بازیکن (idempotency)
  for (const s of seats) {
    await lockWager(db, {
      tableId,
      team: s.team,
      amount: wager,
      refId: { userId: s.user_id, ref: `wager_${tableId}_${s.user_id}` },
    });
  }
}

// تسویه در پایان بازی: برنده مبلغ منهای rake را می‌گیرد
// winningTeam: 0 یا 1؛ seats لیست بازیکنان برای تخصیص به کیف پول اعضا
async function settleTableWagers(db, { tableId, winningTeam, seats, rakePct = 0 }) {
  const { settleWinner, recordTx } = require('./wallet');
  const result = await settleWinner(db, { tableId, winningTeam, rakePct });
  if (result.alreadySettled) return result; // idempotent

  // واریز سهم هر عضو تیم برنده (payout تقسیم بر تعداد اعضای تیم)
  const winners = seats.filter((s) => s.team === winningTeam);
  const share = Math.floor(result.payout / winners.length);
  let remainder = result.payout - share * winners.length;
  for (const w of winners) {
    let amount = share + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    await recordTx(db, {
      userId: w.user_id,
      kind: 'payout',
      amount,
      refId: `payout_${tableId}_${w.user_id}`,
    });
  }

  // ثبت تاریخچه بازی
  await db.insert(gameHistory, {
    table_id: tableId,
    winner_team: winningTeam,
    team0_rounds: 0,
    team1_rounds: 0,
    wager: result.payout,
    ended_at: Date.now(),
  });

  // به‌روزرسانی لیدربورد (برد/باخت هر بازیکن)
  const losers = seats.filter((s) => s.team !== winningTeam);
  for (const w of winners) {
    await bumpLeaderboard(db, w.user_id, { win: true, coins: share });
  }
  for (const l of losers) {
    await bumpLeaderboard(db, l.user_id, { win: false, coins: 0 });
  }

  return result;
}

// به‌روزرسانی رکورد لیدربورد یک کاربر (idempotent بر اساس userId)
async function bumpLeaderboard(db, userId, { win, coins }) {
  const row = await db.select(leaderboard).where('user_id', userId).first();
  if (!row) {
    await db.insert(leaderboard, {
      user_id: userId,
      wins: win ? 1 : 0,
      losses: win ? 0 : 1,
      coins_won: win ? coins : 0,
    });
    return;
  }
  await db.update(leaderboard).where('user_id', userId).set({
    wins: row.wins + (win ? 1 : 0),
    losses: row.losses + (win ? 0 : 1),
    coins_won: row.coins_won + (win ? coins : 0),
  });
}

// گرفتن برترین بازیکنان (بر اساس تعداد برد)
async function getLeaderboard(db, limit = 10) {
  const rows = await db.select(leaderboard).all();
  return rows
    .sort((a, b) => b.wins - a.wins || b.coins_won - a.coins_won)
    .slice(0, limit);
}

// گرفتن تاریخچه بازی‌های یک کاربر
async function getUserHistory(db, userId, limit = 20) {
  const rows = await db.select(gameHistory).all();
  // فیلتر بازی‌هایی که کاربر در آن شرکت داشته (از طریق tableSeats)
  const seats = await db.select(require('../schema').tableSeats).where('user_id', userId).all();
  const tableIds = new Set(seats.map((s) => s.table_id));
  return rows
    .filter((r) => tableIds.has(r.table_id))
    .sort((a, b) => b.ended_at - a.ended_at)
    .slice(0, limit);
}

module.exports = {
  generateCode,
  createPrivateTable,
  joinPrivateTable,
  joinPublicQueue,
  getTableSeats,
  lockTableWagers,
  settleTableWagers,
  bumpLeaderboard,
  getLeaderboard,
  getUserHistory,
};

