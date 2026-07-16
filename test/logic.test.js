// test/logic.test.js
// تست rooms + wallet با یک mock ساده از sdk/db (بدون پلتفرم واقعی)

const assert = require('assert');

// ---- Mock ساده دیتابیس (در حافظه) برای شبیه‌سازی قرارداد sdk/db ----
function makeMockDb() {
  const store = new Map(); // tableName -> array of rows
  let autoId = 1;
  function table(name) {
    if (!store.has(name)) store.set(name, []);
    return store.get(name);
  }
  const db = {
    _store: store,
    select(tbl) {
      const rows = table(tbl._name);
      const q = {
        _rows: rows,
        where(field, val) {
          this._rows = this._rows.filter((r) => r[field] === val);
          return this;
        },
        orderBy(field) {
          this._rows = this._rows.slice().sort((a, b) => a[field] - b[field]);
          return this;
        },
        first() { return this._rows[0] || null; },
        all() { return this._rows; },
      };
      return q;
    },
    insert(tbl, row) {
      const rows = table(tbl._name);
      const id = autoId++;
      const r = { ...row, id };
      rows.push(r);
      return r;
    },
    update(tbl) {
      const rows = table(tbl._name);
      return {
        where(field, val) {
          this._targets = rows.filter((r) => r[field] === val);
          return this;
        },
        set(patch) {
          this._targets.forEach((r) => Object.assign(r, patch));
          return this._targets;
        },
      };
    },
    delete(tbl) {
      const rows = table(tbl._name);
      return {
        where(field, val) {
          const keep = rows.filter((r) => r[field] !== val);
          store.set(tbl._name, keep);
          return this;
        },
      };
    },
  };
  return db;
}

// schema را با نام جدول پر می‌کنیم تا mock کار کند
const schema = require('../schema');
for (const [k, v] of Object.entries(schema)) {
  v._name = k;
}

const { createPrivateTable, joinPrivateTable, joinPublicQueue } = require('../lib/rooms');
const { purchaseWithStars, lockWager, settleWinner, getBalance } = require('../lib/wallet');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

console.log('rooms:');

test('createPrivateTable کد ۶ رقمی و صندلی ۰ می‌سازد', async () => {
  const db = makeMockDb();
  const t = await createPrivateTable(db, { userId: 1, wager: 10 });
  assert.strictEqual(String(t.code).length, 6);
  assert.strictEqual(t.type, 'private');
  assert.strictEqual(t.status, 'waiting');
  const seats = await db.select(schema.tableSeats).all();
  assert.strictEqual(seats.length, 1);
  assert.strictEqual(seats[0].seat, 0);
});

test('joinPrivateTable با کد درست کار می‌کند', async () => {
  const db = makeMockDb();
  const t = await createPrivateTable(db, { userId: 1 });
  await joinPrivateTable(db, { userId: 2, code: t.code });
  await joinPrivateTable(db, { userId: 3, code: t.code });
  await joinPrivateTable(db, { userId: 4, code: t.code });
  const seats = await db.select(schema.tableSeats).all();
  assert.strictEqual(seats.length, 4);
});

test('joinPrivateTable کد غلط ارور می‌دهد', async () => {
  const db = makeMockDb();
  await assert.rejects(() => joinPrivateTable(db, { userId: 2, code: '000000' }), /table_not_found/);
});

test('joinPublicQueue با ۴ نفر atomic میز می‌سازد', async () => {
  const db = makeMockDb();
  const r1 = await joinPublicQueue(db, { userId: 1, wager: 10 });
  const r2 = await joinPublicQueue(db, { userId: 2, wager: 10 });
  const r3 = await joinPublicQueue(db, { userId: 3, wager: 10 });
  const r4 = await joinPublicQueue(db, { userId: 4, wager: 10 });
  assert.strictEqual(r4.started, true);
  const seats = await db.select(schema.tableSeats).all();
  assert.strictEqual(seats.length, 4);
  const q = await db.select(schema.queue).all();
  assert.strictEqual(q.length, 0); // همه از صف حذف شدند
});

console.log('wallet:');

test('purchaseWithStars موجودی را افزایش می‌دهد', async () => {
  const db = makeMockDb();
  await db.insert(schema.users, { id: 1, coins: 0, createdAt: Date.now() });
  await purchaseWithStars(db, { userId: 1, stars: 100, coins: 100, invoiceId: 'inv_1' });
  assert.strictEqual(await getBalance(db, 1), 100);
});

test('purchaseWithStars idempotent است (دوبار پرداخت = یک بار واریز)', async () => {
  const db = makeMockDb();
  await db.insert(schema.users, { id: 1, coins: 0, createdAt: Date.now() });
  await purchaseWithStars(db, { userId: 1, stars: 100, coins: 100, invoiceId: 'inv_x' });
  await purchaseWithStars(db, { userId: 1, stars: 100, coins: 100, invoiceId: 'inv_x' });
  assert.strictEqual(await getBalance(db, 1), 100);
  const txs = await db.select(schema.walletTransactions).all();
  assert.strictEqual(txs.length, 1);
});

test('lockWager و settleWinner idempotent هستند', async () => {
  const db = makeMockDb();
  await db.insert(schema.users, { id: 1, coins: 1000, createdAt: Date.now() });
  await db.insert(schema.users, { id: 2, coins: 1000, createdAt: Date.now() });
  const t = await db.insert(schema.tables, { code: '111111', type: 'private', status: 'playing', wager: 50, createdAt: Date.now() });

  await lockWager(db, { tableId: t.id, team: 0, amount: 50, refId: { userId: 1, ref: 'w0' } });
  await lockWager(db, { tableId: t.id, team: 0, amount: 50, refId: { userId: 1, ref: 'w0' } }); // تکرار
  const w = await db.select(schema.wagers).first();
  assert.strictEqual(w.team0_locked, 50); // فقط یک بار

  const s1 = await settleWinner(db, { tableId: t.id, winningTeam: 0, rakePct: 0.1 });
  const s2 = await settleWinner(db, { tableId: t.id, winningTeam: 0, rakePct: 0.1 });
  assert.strictEqual(s2.alreadySettled, true); // idempotent
  // پات = ۵۰ (فقط تیم ۰ قفل شده در این تست) -> rake ۵ -> payout ۴۵
  assert.strictEqual(s1.payout, 45);
});

(async () => {
  // منتظر می‌ماند تا همه‌ی testهای async بالا تمام شوند
  await new Promise((r) => setImmediate(r));
  console.log(`\n${passed} تست با موفقیت گذشت.`);
})();
