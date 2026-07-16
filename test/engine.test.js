// test/engine.test.js
// تست حلقه‌ی کامل بازی (فاز ۳) بدون دیتابیس
// یک بازی کامل ۱۳ دست را شبیه‌سازی می‌کند و بررسی می‌کند
// که برنده درست تعیین می‌شود و امتیازدهی درست است.

const assert = require('assert');
const {
  createMatchState,
  dealFirstPhase,
  chooseHakemSuit,
  playCard,
  nextRound,
} = require('../lib/engine');
const { validateMove } = require('../lib/rules');

// ربات ساده: اولین کارت مجاز را بازی می‌کند
function pickCard(state, seat) {
  const hand = state.hands[seat];
  const leadSuit = state.currentTrick.length ? state.currentTrick[0].card.suit : null;
  for (const card of hand) {
    const v = validateMove({ leadSuit, hakemSuit: state.hakemSuit, hand, card });
    if (v.valid) return card;
  }
  return hand[0]; // fallback (نباید برسد)
}

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

console.log('engine:');

test('dealFirstPhase حاکم و ۵ کارت اولیه می‌دهد', () => {
  // از rng قطعی برای تکرارپذیری
  let seed = 42;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const state = createMatchState({ seats: [1, 2, 3, 4] });
  dealFirstPhase(state, rng);
  assert.ok(state.hakemSeat >= 0 && state.hakemSeat <= 3);
  assert.strictEqual(state.phase, 'choose_hakem_suit');
  state.initialHands.forEach((h) => assert.strictEqual(h.length, 5));
});

test('chooseHakemSuit کارت‌ها را به ۱۳ می‌رساند', () => {
  let seed = 42;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const state = createMatchState({ seats: [1, 2, 3, 4] });
  dealFirstPhase(state, rng);
  chooseHakemSuit(state, 'hearts');
  assert.strictEqual(state.hakemSuit, 'hearts');
  assert.strictEqual(state.phase, 'playing');
  state.hands.forEach((h) => assert.strictEqual(h.length, 13));
});

test('یک کد کامل (۱۳ دست) بدون خطا اجرا می‌شود و برنده دارد', () => {
  let seed = 7;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const state = createMatchState({ seats: [1, 2, 3, 4] });
  dealFirstPhase(state, rng);
  chooseHakemSuit(state, 'spades');

  let guard = 0;
  while (state.phase === 'playing' && guard < 100) {
    const seat = state.turnSeat;
    const card = pickCard(state, seat);
    playCard(state, seat, card);
    guard++;
  }

  // باید به round_over یا match_over رسیده باشد
  assert.ok(state.phase === 'round_over' || state.phase === 'match_over');
  // جمع دست‌های برنده باید ۱۳ باشد
  assert.strictEqual(state.teamTricks[0] + state.teamTricks[1], 13);
  // تمام کارت‌ها بازی شده‌اند
  state.hands.forEach((h) => assert.strictEqual(h.length, 0));
});

test('بازیکن غیرنوبت ارور می‌دهد', () => {
  let seed = 7;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const state = createMatchState({ seats: [1, 2, 3, 4] });
  dealFirstPhase(state, rng);
  chooseHakemSuit(state, 'spades');
  const wrongSeat = (state.turnSeat + 1) % 4;
  const card = state.hands[wrongSeat][0];
  assert.throws(() => playCard(state, wrongSeat, card), /not_your_turn/);
});

test('دنبال نکردن lead ارور می‌دهد', () => {
  let seed = 7;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const state = createMatchState({ seats: [1, 2, 3, 4] });
  dealFirstPhase(state, rng);
  chooseHakemSuit(state, 'spades');
  // نفر اول (lead) یک کارت hearts می‌زند
  const leadSeat = state.turnSeat;
  const heartsCard = state.hands[leadSeat].find((c) => c.suit === 'hearts') || state.hands[leadSeat][0];
  playCard(state, leadSeat, heartsCard);
  // نفر دوم اگر hearts دارد باید بزند
  const nextSeat = state.turnSeat;
  const hasHearts = state.hands[nextSeat].some((c) => c.suit === 'hearts');
  if (hasHearts) {
    const nonHearts = state.hands[nextSeat].find((c) => c.suit !== 'hearts');
    assert.throws(() => playCard(state, nextSeat, nonHearts), /must_follow_lead/);
  }
});

test('serialize/deserialize state یکپارچه است', () => {
  let seed = 7;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const state = createMatchState({ seats: [1, 2, 3, 4] });
  dealFirstPhase(state, rng);
  chooseHakemSuit(state, 'spades');
  const { serialize, deserialize } = require('../lib/engine');
  const json = serialize(state);
  const restored = deserialize(json);
  assert.strictEqual(restored.hakemSuit, 'spades');
  assert.strictEqual(restored.hands.length, 4);
  assert.strictEqual(restored.phase, 'playing');
});

(async () => {
  await new Promise((r) => setImmediate(r));
  console.log(`\n${passed} تست با موفقیت گذشت.`);
})();
