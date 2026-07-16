// test/integration.test.js
// تست یکپارچه: ۴ بازیکن وارد می‌شوند، بازی کامل انجام می‌دهند
// از apiHandler با یک ctx شبیه‌سازی‌شده استفاده می‌کند (بدون HTTP)

const assert = require('assert');
const schema = require('../schema');
for (const [k, v] of Object.entries(schema)) v._name = k;

const apiHandler = require('../handlers/api');
const { validateMove } = require('../lib/rules');

// ساخت دیتابیس در حافظه
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
    insert(tbl, row) { const rows = table(tbl._name); const r = { ...row, id: autoId++ }; rows.push(r); return r; },
    update(tbl) { const rows = table(tbl._name); return { where(f, v) { this._t = rows.filter((r) => r[f] === v); return this; }, set(p) { this._t.forEach((r) => Object.assign(r, p)); return this._t; } }; },
    delete(tbl) { const rows = table(tbl._name); return { where(f, v) { store.set(tbl._name, rows.filter((r) => r[f] !== v)); return this; } }; },
  };
}

// ساخت ctx شبیه‌سازی‌شده برای یک userId
function makeCtx(db, userId) {
  let captured = null;
  const ctx = {
    request: { method: 'POST', body: {}, headers: { 'x-init-data': String(userId) } },
    db,
    json(obj, status = 200) { captured = { obj, status }; return captured; },
  };
  ctx.call = async (action, payload) => {
    ctx.request.body = { action, payload: payload || {}, initData: String(userId) };
    await apiHandler(ctx);
    return captured.obj;
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

console.log('integration:');

test('۴ بازیکن وارد می‌شوند و یک بازی کامل انجام می‌دهند', async () => {
  const db = makeDb();
  const users = [101, 102, 103, 104];
  const ctxs = users.map((u) => makeCtx(db, u));

  // ۱. همه وارد صف عمومی می‌شوند
  const r0 = await ctxs[0].call('join_public_queue');
  await ctxs[1].call('join_public_queue');
  await ctxs[2].call('join_public_queue');
  const r3 = await ctxs[3].call('join_public_queue');
  assert.strictEqual(r3.started, true, 'باید میز ساخته شود');

  // ۲. اولین نفر بازی را شروع می‌کند
  const st = await ctxs[0].call('start_match', { flags: { roundsToWin: 2, target: 7 } });
  assert.strictEqual(st.ok, true);
  assert.strictEqual(st.state.phase, 'choose_hakem_suit');

  // ۳. حاکم حکم را انتخاب می‌کند
  const hakemSeat = st.state.hakemSeat;
  const hakemCtx = ctxs[hakemSeat];
  const suitRes = await hakemCtx.call('choose_suit', { suit: 'hearts' });
  assert.strictEqual(suitRes.state.hakemSuit, 'hearts');
  assert.strictEqual(suitRes.state.phase, 'playing');

  // ۴. حلقه‌ی بازی تا پایان کد اول
  let guard = 0;
  let cur = suitRes.state;
  while (cur.phase === 'playing' && guard < 200) {
    const seat = cur.turnSeat;
    const card = botPick(cur, seat);
    const res = await ctxs[seat].call('play_card', { card });
    cur = res.state;
    guard++;
  }
  assert.strictEqual(cur.phase, 'round_over', 'کد اول باید تمام شود');
  assert.strictEqual(cur.teamTricks[0] + cur.teamTricks[1], 13, '۱۳ دست بازی شود');

  // ۵. ادامه به کدهای بعدی تا پایان بازی (match_over)
  let roundGuard = 0;
  while (cur.phase === 'round_over' && roundGuard < 50) {
    const nr = await ctxs[0].call('next_round');
    assert.strictEqual(nr.ok, true);
    cur = nr.state;
    // انتخاب حکم توسط حاکم جدید
    const hs = cur.hakemSeat;
    const sres = await ctxs[hs].call('choose_suit', { suit: 'spades' });
    cur = sres.state;
    // بازی کد
    let g2 = 0;
    while (cur.phase === 'playing' && g2 < 200) {
      const seat = cur.turnSeat;
      const card = botPick(cur, seat);
      const res = await ctxs[seat].call('play_card', { card });
      if (res.error) { console.log('ERR play', res.error); break; }
      cur = res.state;
      g2++;
    }
    roundGuard++;
  }
  assert.strictEqual(cur.phase, 'match_over', 'بازی باید تمام شود');
  assert.ok(cur.matchWinner === 0 || cur.matchWinner === 1, 'باید برنده داشته باشد');
});

(async () => {
  await new Promise((r) => setImmediate(r));
  console.log(`\n${passed} تست با موفقیت گذشت.`);
})();
