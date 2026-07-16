// schema.js
// تعریف جداول دیتابیس داخلی Serverless (SQLite)
// قرارداد: import با نام bare از 'sdk/db'، بدون foreign key
// هر تغییر schema جدا از push با migrate اعمال می‌شود

const { defineTable, integer, text, real } = require('sdk/db');

// کاربران
const users = defineTable('users', {
  id: integer('id').primaryKey(),        // شناسه‌ی عددی تلگرام (user_id)
  username: text('username'),
  firstName: text('first_name'),
  coins: integer('coins').default(0),    // موجودی سکه (فقط داخلی، غیرقابل تبدیل به پول)
  createdAt: integer('created_at'),
});

// میزها (اتاق‌ها)
const tables = defineTable('tables', {
  id: integer('id').primaryKey().autoIncrement(),
  code: text('code'),                    // کد ۶ رقمی اتاق خصوصی
  type: text('type').default('public'),  // 'private' | 'public'
  status: text('status').default('waiting'), // 'waiting' | 'playing' | 'finished'
  wager: integer('wager').default(0),    // مبلغ شرط (سکه) هر بازیکن
  createdAt: integer('created_at'),
});

// صندلی‌های میز
const tableSeats = defineTable('table_seats', {
  id: integer('id').primaryKey().autoIncrement(),
  tableId: integer('table_id'),
  userId: integer('user_id'),
  seat: integer('seat'),                 // ۰..۳ (روبرو = هم‌تیمی)
  team: integer('team'),                 // ۰ یا ۱
  joinedAt: integer('joined_at'),
});

// وضعیت هر «کد» (round)
const rounds = defineTable('rounds', {
  id: integer('id').primaryKey().autoIncrement(),
  tableId: integer('table_id'),
  roundNo: integer('round_no').default(1),
  hakemSuit: text('hakem_suit'),         // خال حکم
  hakemSeat: integer('hakem_seat'),      // صندلی حاکم
  turnSeat: integer('turn_seat'),        // نوبت فعلی
  team0Tricks: integer('team0_tricks').default(0),
  team1Tricks: integer('team1_tricks').default(0),
  status: text('status').default('active'), // 'active' | 'done'
});

// دست‌های بازی‌شده (tricks)
const tricks = defineTable('tricks', {
  id: integer('id').primaryKey().autoIncrement(),
  roundId: integer('round_id'),
  trickNo: integer('trick_no'),
  leadSuit: text('lead_suit'),
  plays: text('plays'),                  // JSON: [{seat, card}, ...]
  winnerSeat: integer('winner_seat'),
});

// صف مچ‌میکینگ عمومی
const queue = defineTable('queue', {
  id: integer('id').primaryKey().autoIncrement(),
  userId: integer('user_id'),
  wager: integer('wager').default(0),
  enteredAt: integer('entered_at'),
});

// تراکنش‌های کیف پول
const walletTransactions = defineTable('wallet_transactions', {
  id: integer('id').primaryKey().autoIncrement(),
  userId: integer('user_id'),
  kind: text('kind'),                    // 'stars_purchase' | 'wager_lock' | 'payout' | 'rake'
  amount: integer('amount'),             // مثبت = واریز، منفی = برداشت
  refId: text('ref_id'),                 // شناسه‌ی idempotency / Stars invoice
  createdAt: integer('created_at'),
});

// escrow شرط‌بندی هر میز
const wagers = defineTable('wagers', {
  id: integer('id').primaryKey().autoIncrement(),
  tableId: integer('table_id'),
  team0Locked: integer('team0_locked').default(0),
  team1Locked: integer('team1_locked').default(0),
  settled: integer('settled').default(0), // ۰ = باز، ۱ = تسویه‌شده (idempotency)
  settledAt: integer('settled_at'),
});

// تاریخچه بازی‌های تمام‌شده
const gameHistory = defineTable('game_history', {
  id: integer('id').primaryKey().autoIncrement(),
  tableId: integer('table_id'),
  winnerTeam: integer('winner_team'),        // ۰ یا ۱
  team0Rounds: integer('team0_rounds').default(0),
  team1Rounds: integer('team1_rounds').default(0),
  wager: integer('wager').default(0),
  endedAt: integer('ended_at'),
});

// بردهای هر بازیکن در بازی‌های شرط‌بندی (برای لیدربورد)
const leaderboard = defineTable('leaderboard', {
  id: integer('id').primaryKey().autoIncrement(),
  userId: integer('user_id'),
  wins: integer('wins').default(0),
  losses: integer('losses').default(0),
  coinsWon: integer('coins_won').default(0), // مجموع سکه برده (فقط داخلی)
});

module.exports = {
  users,
  tables,
  tableSeats,
  rounds,
  tricks,
  queue,
  walletTransactions,
  wagers,
  gameHistory,
  leaderboard,
};
