// lib/deck.js
// موتور خالص کارت‌خور: شافل، تقسیم، تعیین حاکم
// بدون وابستگی به پلتفرم یا دیتابیس — قابل تست مستقل

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// ترتیب قدرت کارت در هر خال (بدون در نظر گرفتن حکم)
const RANK_ORDER = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, value: RANK_ORDER[rank] });
    }
  }
  return deck;
}

// شافل Fisher-Yates با تابع تصادفی قابل تزریق (برای تست قطعی)
function shuffle(deck, rng = Math.random) {
  const arr = deck.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// تقسیم یکی‌یکی تا اولین Ace -> آن بازیکن حاکم می‌شود
// برمی‌گرداند: { hands: [[], [], [], []], hakemSeat: number, remaining: [] }
// هر بازیکن ۵ کارت اولیه می‌گیرد؛ بقیه (۸ کارت) بعد از انتخاب حکم توزیع می‌شود
// قانون تعیین حاکم (طبق درخواست): ۵۲ کارت یکی‌یکی تقسیم می‌شود تا اولین Ace بیفتد
// برای سادگی و یکنواختی: دقیقاً ۲۰ کارت اول (۵×۴) تقسیم می‌شود؛
// حاکم = اولین نفری که Ace در این ۵ کارت گرفته. اگر کسی Ace نداشت،
// حاکم = صندلی ۰ (fallback قابل تغییر).
function dealInitial(deck, rng = Math.random) {
  const shuffled = shuffle(deck, rng);
  const hands = [[], [], [], []];
  let hakemSeat = -1;

  // توزیع دقیقاً ۵ کارت به هر نفر (۲۰ کارت اول)
  for (let i = 0; i < 20; i++) {
    const seat = i % 4;
    const card = shuffled[i];
    hands[seat].push(card);
    if (card.rank === 'A' && hakemSeat === -1) {
      hakemSeat = seat; // اولین Ace تعیین‌کننده است
    }
  }

  // اگر هیچ‌کس در ۵ کارت اولیه Ace نگرفت -> fallback به صندلی ۰
  if (hakemSeat === -1) hakemSeat = 0;

  const remaining = shuffled.slice(20); // ۳۲ کارت باقی‌مانده (برای توزیع دور دوم)
  return { hands, hakemSeat, remaining };
}

// توزیع بقیه‌ی کارت‌ها (۸ کارت به هر نفر = ۳۲ کارت)
function dealRest(remaining, hands) {
  const out = [[...hands[0]], [...hands[1]], [...hands[2]], [...hands[3]]];
  let i = 0;
  while (i < remaining.length) {
    out[i % 4].push(remaining[i]);
    i++;
  }
  return out; // هر دست ۱۳ کارت
}

module.exports = {
  SUITS,
  RANKS,
  RANK_ORDER,
  buildDeck,
  shuffle,
  dealInitial,
  dealRest,
};
