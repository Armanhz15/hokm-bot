// test/history.test.js
// تست فاز ۶: ثبت تاریخچه بازی و لیدربورد بعد از تسویه
const assert = require('assert');
const schema = require('../schema');
for (const [k, v] of Object.entries(schema)) v._name = k;
const apiHandler = require('../handlers/api');
const { validateMove } = require('../lib/rules');

function makeDb() {
  const store = new Map(); let autoId = 1;
  function table(n) { if (!store.has(n)) store.set(n, []); return store.get(n); }
  return {
    select(tbl) { const rows = table(tbl._name); const q = { _rows: rows, where(f, v) { this._rows = this._rows.filter((r) => r[f] === v); return this; }, orderBy(f) { this._rows = this._rows.slice().sort((a, b) => a[f] - b[f]); return this; }, first() { return this._rows[0] || null; }, all() { return this._rows; } }; return q; },
    insert(tbl, row) { const rows = table(tbl._name); const r = { ...row }; if (r.id === undefined) r.id = autoId++; rows.push(r); return r; },
    update(tbl) { const rows = table(tbl._name); return { where(f, v) { this._t = rows.filter((r) => r[f] === v); return this; }, set(p) { this._t.forEach((r) => Object.assign(r, p)); return this._t; } }; },
    delete(tbl) { const rows = table(tbl._name); return { where(f, v) { store.set(tbl._name, rows.filter((r) => r[f] !== v)); return this; } }; },
  };
}
function makeCtx(db, u) {
  let cap;
  const ctx = { request: { method: 'POST', body: {}, headers: { 'x-init-data': String(u) } }, db, json(o, s) { cap = { obj: o, status: s }; return cap; } };
  ctx.call = async (a, p) => { ctx.request.body = { action: a, payload: p || {}, initData: String(u) }; const ex = await db.select(schema.users).where('id', u).first(); if (!ex) await db.insert(schema.users, { id: u, coins: 0, createdAt: Date.now() }); await apiHandler(ctx); return cap.obj; };
  return ctx;
}
function botPick(state, seat) {
  const hand = state.hands[seat];
  const leadSuit = state.currentTrick.length ? state.currentTrick[0].card.suit : null;
  for (const card of hand) { const v = validateMove({ leadSuit, hakemSuit: state.hakemSuit, hand, card }); if (v.valid) return card; }
  return hand[0];
}

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.stack); process.exitCode = 1; }
}

console.log('history/leaderboard:');

test('بعد از بازی: تاریخچه و لیدربورد ثبت می‌شود', async () => {
  const db = makeDb();
  const users = [501, 502, 503, 504];
  const ctxs = users.map((u) => makeCtx(db, u));
  for (const c of ctxs) await c.call('buy_stars', { coins: 200, invoiceId: 'inv_' + c.request.headers['x-init-data'] });
  const create = await ctxs[0].call('create_private', { wager: 50 });
  await ctxs[1].call('join_private_code', { code: create.table.code });
  await ctxs[2].call('join_private_code', { code: create.table.code });
  await ctxs[3].call('join_private_code', { code: create.table.code });
  const st = await ctxs[0].call('start_match', { flags: { roundsToWin: 1, target: 7 } });
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
  assert.strictEqual(cur.phase, 'match_over');

  // تاریخچه باید ثبت شده باشد
  const hist = await ctxs[0].call('history');
  assert.strictEqual(hist.history.length, 1, 'باید ۱ بازی در تاریخچه باشد');

  // لیدربورد: برنده باید wins >= 1 داشته باشد
  const lb = await ctxs[0].call('leaderboard');
  assert.ok(lb.leaderboard.length >= 1);
  const winningTeam = cur.matchWinner;
  const winners = users.filter((u, i) => (i % 2) === winningTeam);
  for (const w of winners) {
    const row = lb.leaderboard.find((r) => r.user_id === w);
    assert.ok(row && row.wins >= 1, `برنده ${w} باید حداقل ۱ برد داشته باشد`);
  }
  // بازنده‌ها باید losses >= 1 داشته باشند
  const losers = users.filter((u, i) => (i % 2) !== winningTeam);
  for (const l of losers) {
    const row = lb.leaderboard.find((r) => r.user_id === l);
    assert.ok(row && row.losses >= 1, `بازنده ${l} باید حداقل ۱ باخت داشته باشد`);
  }
});

test('لیدربورد بر اساس تعداد برد مرتب می‌شود', async () => {
  const db = makeDb();
  const { bumpLeaderboard, getLeaderboard } = require('../lib/rooms');
  await bumpLeaderboard(db, 601, { win: true, coins: 100 });
  await bumpLeaderboard(db, 601, { win: true, coins: 50 });
  await bumpLeaderboard(db, 602, { win: true, coins: 10 });
  await bumpLeaderboard(db, 603, { win: false, coins: 0 });
  const top = await getLeaderboard(db, 10);
  assert.strictEqual(top[0].user_id, 601, 'باید کاربر با بیشترین برد اول باشد');
  assert.strictEqual(top[0].wins, 2);
});

(async () => {
  await new Promise((r) => setImmediate(r));
  console.log(`\n${passed} تست با موفقیت گذشت.`);
})();
