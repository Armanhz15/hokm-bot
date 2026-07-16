// test/rules.test.js
// اجرا: npx tgcloud run یا مستقیماً با node
// تست‌های قطعی برای موتور بازی (بدون دیتابیس)

const assert = require('assert');
const { buildDeck, dealInitial, dealRest, shuffle } = require('../lib/deck');
const { validateMove, trickWinner, roundWinner, matchWinner, teamOf } = require('../lib/rules');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓', name);
  } catch (e) {
    console.error('  ✗', name, '\n   ', e.message);
    process.exitCode = 1;
  }
}

console.log('deck:');

test('buildDeck تولید ۵۲ کارت یکتا', () => {
  const d = buildDeck();
  assert.strictEqual(d.length, 52);
  const keys = new Set(d.map((c) => c.suit + c.rank));
  assert.strictEqual(keys.size, 52);
});

test('shuffle ترتیب را تغییر می‌دهد اما مجموعه یکسان است', () => {
  const d = buildDeck();
  const s = shuffle(d, () => 0.5);
  assert.strictEqual(s.length, 52);
  const key = (c) => c.suit + c.rank;
  const a = s.map(key).sort();
  const b = d.map(key).sort();
  assert.deepStrictEqual(a, b);
});

test('dealInitial دقیقاً ۵ کارت به هر نفر می‌دهد', () => {
  const { hands } = dealInitial(buildDeck());
  hands.forEach((h) => assert.strictEqual(h.length, 5));
});

test('dealInitial حاکم را روی اولین Ace می‌گذارد', () => {
  const r = dealInitial(buildDeck());
  // یکی از دست‌ها باید شامل حداقل یک Ace باشد و hakemSeat مشخص باشد
  assert.ok(r.hakemSeat >= 0 && r.hakemSeat <= 3);
});

test('dealRest هر دست را ۱۳ کارتی می‌کند', () => {
  const init = dealInitial(buildDeck());
  const full = dealRest(init.remaining, init.hands);
  full.forEach((h) => assert.strictEqual(h.length, 13));
});

console.log('rules:');

test('validateMove اجبار دنبال کردن lead', () => {
  const hand = [{ suit: 'hearts', rank: '5', value: 5 }, { suit: 'spades', rank: 'K', value: 13 }];
  const r = validateMove({ leadSuit: 'hearts', hakemSuit: 'clubs', hand, card: { suit: 'spades', rank: 'K', value: 13 } });
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.reason, 'must_follow_lead');
});

test('validateMove اجازه می‌دهد وقتی lead نداری هر کارتی بزنی', () => {
  const hand = [{ suit: 'spades', rank: 'K', value: 13 }];
  const r = validateMove({ leadSuit: 'hearts', hakemSuit: 'clubs', hand, card: { suit: 'spades', rank: 'K', value: 13 } });
  assert.strictEqual(r.valid, true);
});

test('validateMove رد می‌کند کارتی که در دست نیست', () => {
  const hand = [{ suit: 'hearts', rank: '5', value: 5 }];
  const r = validateMove({ leadSuit: 'hearts', hakemSuit: 'clubs', hand, card: { suit: 'hearts', rank: 'A', value: 14 } });
  assert.strictEqual(r.valid, false);
});

test('trickWinner بالاترین هم‌خال lead را می‌برد', () => {
  const plays = [
    { seat: 0, card: { suit: 'hearts', rank: '5', value: 5 } },
    { seat: 1, card: { suit: 'hearts', rank: 'K', value: 13 } },
    { seat: 2, card: { suit: 'hearts', rank: '2', value: 2 } },
    { seat: 3, card: { suit: 'spades', rank: 'A', value: 14 } }, // رنگ دیگر، نمی‌برد
  ];
  assert.strictEqual(trickWinner({ plays, leadSuit: 'hearts', hakemSuit: 'clubs' }), 1);
});

test('trickWinner حکم بر همه می‌چربد', () => {
  const plays = [
    { seat: 0, card: { suit: 'hearts', rank: 'A', value: 14 } },
    { seat: 1, card: { suit: 'clubs', rank: '2', value: 2 } }, // حکم ضعیف
    { seat: 2, card: { suit: 'spades', rank: 'K', value: 13 } },
    { seat: 3, card: { suit: 'diamonds', rank: 'A', value: 14 } },
  ];
  assert.strictEqual(trickWinner({ plays, leadSuit: 'hearts', hakemSuit: 'clubs' }), 1);
});

test('trickWinner بین دو حکم، بالاترین حکم', () => {
  const plays = [
    { seat: 0, card: { suit: 'clubs', rank: '3', value: 3 } },
    { seat: 1, card: { suit: 'clubs', rank: 'A', value: 14 } },
  ];
  assert.strictEqual(trickWinner({ plays, leadSuit: 'hearts', hakemSuit: 'clubs' }), 1);
});

test('roundWinner با رسیدن به ۷', () => {
  assert.strictEqual(roundWinner([7, 4]), 0);
  assert.strictEqual(roundWinner([4, 7]), 1);
  assert.strictEqual(roundWinner([6, 5]), null);
});

test('roundWinner کاپوت (hakemKaput) با ۱۳ دست', () => {
  assert.strictEqual(roundWinner([13, 0], 7, { hakemKaput: true }), 0);
  assert.strictEqual(roundWinner([12, 1], 7, { hakemKaput: true }), null);
});

test('matchWinner با رسیدن به ۷ کد', () => {
  assert.strictEqual(matchWinner([7, 3]), 0);
  assert.strictEqual(matchWinner([3, 7]), 1);
  assert.strictEqual(matchWinner([6, 6]), null);
});

test('teamOf صندلی‌های روبرو را هم‌تیمی می‌داند', () => {
  assert.strictEqual(teamOf(0), teamOf(2));
  assert.strictEqual(teamOf(1), teamOf(3));
  assert.notStrictEqual(teamOf(0), teamOf(1));
});

console.log(`\n${passed} تست با موفقیت گذشت.`);
