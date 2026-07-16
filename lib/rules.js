// lib/rules.js
// اعتبارسنجی حرکت و تشخیص برنده‌ی هر دست (trick)
// بدون وابستگی به پلتفرم

const { RANK_ORDER } = require('./deck');

// leadSuit: خال کارت اول دست (undefined اگر خالی باشد)
// hakemSuit: خال حکم
// hand: کارت‌های بازیکن
// card: کارتی که می‌خواهد بازی کند
// برمی‌گرداند: { valid: boolean, reason?: string }
function validateMove({ leadSuit, hakemSuit, hand, card }) {
  if (!card) return { valid: false, reason: 'no_card' };
  const inHand = hand.some((c) => c.suit === card.suit && c.rank === card.rank);
  if (!inHand) return { valid: false, reason: 'not_in_hand' };

  if (leadSuit) {
    const hasLead = hand.some((c) => c.suit === leadSuit);
    if (hasLead && card.suit !== leadSuit) {
      return { valid: false, reason: 'must_follow_lead' };
    }
  }
  return { valid: true };
}

// تعیین برنده‌ی یک دست
// plays: [{ seat, card }, ...] — ترتیب بازی شده
// leadSuit: خال کارت اول
// hakemSuit: خال حکم
// برمی‌گرداند: seat برنده
function trickWinner({ plays, leadSuit, hakemSuit }) {
  let best = plays[0];
  for (let i = 1; i < plays.length; i++) {
    const cur = plays[i];
    const prev = best;
    if (isHigher(cur.card, prev.card, leadSuit, hakemSuit)) {
      best = cur;
    }
  }
  return best.seat;
}

// آیا a از b بالاتر است با در نظر گرفتن حکم و lead
function isHigher(a, b, leadSuit, hakemSuit) {
  const aHakem = a.suit === hakemSuit;
  const bHakem = b.suit === hakemSuit;
  if (aHakem && !bHakem) return true;
  if (!aHakem && bHakem) return false;
  if (aHakem && bHakem) return a.value > b.value;

  // هیچ‌کدام حکم نیستند
  const aLead = a.suit === leadSuit;
  const bLead = b.suit === leadSuit;
  if (aLead && !bLead) return true;
  if (!aLead && bLead) return false;
  if (aLead && bLead) return a.value > b.value;

  // هیچ‌کدام lead نیستند -> کارت رنگ دیگر، نمی‌تواند ببرد
  return false;
}

// آیا تیم برنده یک «کد» (round) را برده است؟
// هدف پیش‌فرض: ۷ دست
// flags: { hakemKaput: boolean } -> اگر تیم حاکم همه‌ی ۱۳ دست را ببرد = کاپوت
function roundWinner(teamTricks, target = 7, flags = {}) {
  const t0 = teamTricks[0]; // امتیاز تیم ۰
  const t1 = teamTricks[1]; // امتیاز تیم ۱
  if (flags.hakemKaput) {
    // کاپوت فقط با برد تمام ۱۳ دست معتبر است
    if (t0 === 13) return 0;
    if (t1 === 13) return 1;
    return null;
  }
  if (t0 >= target) return 0;
  if (t1 >= target) return 1;
  return null; // هنوز تمام نشده
}

// آیا کل بازی تمام شده (رسیدن به تعداد کدهای هدف)
function matchWinner(teamRounds, roundsToWin = 7) {
  if (teamRounds[0] >= roundsToWin) return 0;
  if (teamRounds[1] >= roundsToWin) return 1;
  return null;
}

// هم‌تیمی: صندلی‌های (0,2) و (1,3) روبروی هم
function teammateOf(seat) {
  return (seat + 2) % 4;
}

function teamOf(seat) {
  return seat % 2; // تیم ۰: صندلی‌های ۰ و ۲؛ تیم ۱: ۱ و ۳
}

module.exports = {
  validateMove,
  trickWinner,
  isHigher,
  roundWinner,
  matchWinner,
  teammateOf,
  teamOf,
};
