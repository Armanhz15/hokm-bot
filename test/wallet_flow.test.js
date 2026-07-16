// test/wallet_flow.test.js
// تست جریان کیف پول + شرط‌بندی (فاز ۵): خرید Stars، قفل escrow، تسویه برنده
// از apiHandler با ctx شبیه‌سازی‌شده استفاده می‌کند

const assert = require('assert');
const schema = require('../schema');
for (const [k, v] of Object.entries(schema)) v._name = k;
const apiHandler = require('../handlers/api');
const { validateMove } = require('../lib/rules');

function makeDb() {
  const store = new Map();
  let autoId = 1;
  function table(n) { if (!store.has(n)) store.set(n, []); return store.get(n); }
  return {
    select(tbl) {
      const rows = table(tbl._name);
      const q = { _rows: rows, where(f, v) { this._rows = this._rows.filter((r) => r[f] === v); return this; }, orderBy(f) { this._rows = this._rows.slice().sort((a, b) => a[f] - b[f]); return this; }, first() { return this._rows[0] || null; }, all() { return this._rows; } };
      return q;
    },
    insert(tbl, row) {
      const rows = table(tbl._name);
      const r = { ...row };
      if (r.id === undefined) r.id = autoId++;
      rows.push(r);
      return r;
    },
    update(tbl) { const rows = table(tbl._name); return { where(f, v) { this._t = rows.filter((r) => r[f] === v); return this; }, set(p) { this._t.forEach((r) => Object.assign(r, p)); return this._t; } }; },
    delete(tbl) { const rows = table(tbl._name); return { where(f, v) { store.set(tbl._name, rows.filter((r) => r[f] !== v)); return this; } }; },
  };
}
function makeCtx(db, u) {
  let cap;
  const ctx = { request: { method: 'POST', body: {}, headers: { 'x-init-data': String(u) } }, db, json(o, s) { cap = { obj: o, status: s }; return cap; } };
  ctx.call = async (a, p) => {
    ctx.request.body = { action: a, payload: p || {}, initData: String(u) };
    // اطمینان از وجود رکورد کاربر (مثل دستور /start در پلتفرم واقعی)
    const existing = await db.select(schema.users).where('id', u).first();
    if (!existing) await db.insert(schema.users, { id: u, coins: 0, createdAt: Date.now() });
    await apiHandler(ctx);
    return cap.obj;
  };
  return ctx;
}
function botPick(state, seat) {
  const hand = state.hands[seat];
  const leadSuit = state.currentTrick.length ? state.currentTrick[0].card.suit : null;
  for (const card of hand) {
    const v = validateMove({ leadSuit, hakemSuit: state.hakemSuit, hand, card });
    if (v.valid) return card;
  }
  return hand[0];
}

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.stack); process.exitCode = 1; }
}

console.log('wallet_flow:');

test('خرید Stars موجودی را افزایش می‌دهد و idempotent است', async () => {
  const db = makeDb();
  const ctx = makeCtx(db, 201);
  const r1 = await ctx.call('buy_stars', { coins: 100, invoiceId: 'inv_A' });
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r1.balance, 100);
  // تکرار با همان invoiceId نباید دوبار واریز کند
  const r2 = await ctx.call('buy_stars', { coins: 100, invoiceId: 'inv_A' });
  assert.strictEqual(r2.balance, 100, 'idempotent باشد');
});

test('میز شرط‌بندی: قفل escrow و تسویه به برنده', async () => {
  const db = makeDb();
  const users = [301, 302, 303, 304];
  const ctxs = users.map((u) => makeCtx(db, u));
  const WAGER = 50;

  // همه سکه می‌خرند
  for (const c of ctxs) {
    const r = await c.call('buy_stars', { coins: 200, invoiceId: 'inv_' + c.request.headers['x-init-data'] });
    assert.strictEqual(r.ok, true);
  }

  // ساخت میز شرط‌بندی خصوصی
  const create = await ctxs[0].call('create_private', { wager: WAGER });
  assert.strictEqual(create.table.wager, WAGER);
  await ctxs[1].call('join_private_code', { code: create.table.code });
  await ctxs[2].call('join_private_code', { code: create.table.code });
  await ctxs[3].call('join_private_code', { code: create.table.code });

  // شروع بازی -> باید سکه قفل شود
  const st = await ctxs[0].call('start_match', { flags: { roundsToWin: 1, target: 7 } });
  assert.strictEqual(st.ok, true);

  // بررسی موجودی بعد از قفل (۲۰۰ - ۵۰ = ۱۵۰)
  const bal0 = await ctxs[0].call('get_balance');
  assert.strictEqual(bal0.balance, 150, 'باید ۵۰ سکه قفل شده باشد');

  // بازی کد اول تا پایان
  const hs = st.state.hakemSeat;
  let cur = (await ctxs[hs].call('choose_suit', { suit: 'hearts' })).state;
  let guard = 0;
  while (cur.phase === 'playing' && guard < 200) {
    const seat = cur.turnSeat;
    const card = botPick(cur, seat);
    const res = await ctxs[seat].call('play_card', { card });
    if (res.error) break;
    cur = res.state;
    guard++;
  }
  // با roundsToWin=1، بعد از اولین کد بازی باید تمام شود
  assert.strictEqual(cur.phase, 'match_over', 'بازی باید تمام شود');

  // بررسی تسویه: تیم برنده باید سکه گرفته باشد
  // با roundsToWin=1 هر تیمی که کد را برد برنده بازی است
  const winningTeam = cur.matchWinner;
  // نقشه userId -> ctx (چون ctxs به ترتیب users است)
  const ctxById = {};
  users.forEach((u, i) => { ctxById[u] = ctxs[i]; });
  for (const u of users) {
    const b = await ctxById[u].call('get_balance');
    const isWinner = (users.indexOf(u) % 2) === winningTeam;
    if (isWinner) {
      assert.strictEqual(b.balance, 200, `برنده ${u} باید ۲۰۰ سکه داشته باشد`);
    } else {
      assert.strictEqual(b.balance, 150, `بازنده ${u} باید ۱۵۰ سکه داشته باشد`);
    }
  }
});

test('میز شرط‌بندی با موجودی ناکافی شروع نمی‌شود', async () => {
  const db = makeDb();
  const users = [401, 402, 403, 404];
  const ctxs = users.map((u) => makeCtx(db, u));
  // فقط یک نفر سکه می‌خرد
  await ctxs[0].call('buy_stars', { coins: 200, invoiceId: 'inv_401' });

  const create = await ctxs[0].call('create_private', { wager: 100 });
  await ctxs[1].call('join_private_code', { code: create.table.code });
  await ctxs[2].call('join_private_code', { code: create.table.code });
  await ctxs[3].call('join_private_code', { code: create.table.code });

  const st = await ctxs[0].call('start_match', { flags: { roundsToWin: 1 } });
  assert.strictEqual(st.error, 'insufficient_balance', 'باید ارور موجودی ناکافی بدهد');
});

(async () => {
  await new Promise((r) => setImmediate(r));
  console.log(`\n${passed} تست با موفقیت گذشت.`);
})();
