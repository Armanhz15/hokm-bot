// lib/engine.js
// موتور بازی: مدیریت وضعیت یک میز، توزیع، انتخاب حکم، نوبتی، امتیازدهی
// state به صورت plain object نگه داشته می‌شود (برای serialize در دیتابیس)
// هیچ وابستگی به پلتفرم ندارد - قابل تست بدون دیتابیس

const { buildDeck, dealInitial, dealRest } = require('./deck');
const { validateMove, trickWinner, teamOf, teammateOf } = require('./rules');
const { applyTrickResult, roundComplete, decideRound } = require('./scoring');

// ساختار state میز:
// {
//   phase: 'deal' | 'choose_hakem_suit' | 'playing' | 'round_over' | 'match_over',
//   seats: [userId, userId, userId, userId],   // ترتیب صندلی‌ها
//   hands: [[card,...] x4],                     // دست‌های ۱۳ تایی (بعد از dealRest)
//   initialHands: [[card,...] x4],              // ۵ کارت اولیه (قبل از انتخاب حکم)
//   hakemSeat: number,
//   hakemSuit: string|null,
//   turnSeat: number,
//   leadSeat: number|null,
//   currentTrick: [{seat, card}],              // کارت‌های بازی‌شده در دست جاری
//   trickNo: number,                           // شمارنده دست (۰..۱۲)
//   teamTricks: {0: n, 1: n},                  // امتیاز دست‌های کد جاری
//   teamRounds: {0: n, 1: n},                  // امتیاز کدهای بازی
//   flags: { target: 7, hakemKaput: false, roundsToWin: 7 },
//   lastWinner: number|null,
// }

function createMatchState({ seats, flags = {} }) {
  return {
    phase: 'deal',
    seats,
    hands: [[], [], [], []],
    initialHands: [[], [], [], []],
    hakemSeat: -1,
    hakemSuit: null,
    turnSeat: 0,
    leadSeat: null,
    currentTrick: [],
    trickNo: 0,
    teamTricks: { 0: 0, 1: 0 },
    teamRounds: { 0: 0, 1: 0 },
    flags: {
      target: flags.target || 7,
      hakemKaput: !!flags.hakemKaput,
      roundsToWin: flags.roundsToWin || 7,
    },
    lastWinner: null,
  };
}

// مرحله ۱: توزیع ۵ کارت اول + تعیین حاکم؛ برمی‌گرداند state بروزرسانی‌شده
function dealFirstPhase(state, rng = Math.random) {
  const { hands, hakemSeat, remaining } = dealInitial(buildDeck(), rng);
  state.initialHands = hands.map((h) => h.slice());
  state.hands = hands.map((h) => h.slice());
  state._remaining = remaining; // برای توزیع دور دوم (سریالایز نمی‌شود)
  state.hakemSeat = hakemSeat;
  state.turnSeat = hakemSeat; // حاکم اولین نوبت برای انتخاب خال
  state.phase = 'choose_hakem_suit';
  return state;
}

// حاکم خال حکم را انتخاب می‌کند -> توزیع بقیه‌ی کارت‌ها
function chooseHakemSuit(state, suit) {
  if (state.phase !== 'choose_hakem_suit') throw new Error('not_in_choose_phase');
  if (state.turnSeat !== state.hakemSeat) throw new Error('not_hakem_turn');
  state.hakemSuit = suit;
  if (state._remaining) {
    state.hands = dealRest(state._remaining, state.hands);
    delete state._remaining;
  }
  state.phase = 'playing';
  state.turnSeat = (state.hakemSeat + 1) % 4; // نفر بعد از حاکم شروع می‌کند
  state.leadSeat = state.turnSeat;
  return state;
}

// بازی یک کارت در نوبت فعلی
// card: {suit, rank}
function playCard(state, seat, card) {
  if (state.phase !== 'playing') throw new Error('not_playing');
  if (seat !== state.turnSeat) throw new Error('not_your_turn');

  const hand = state.hands[seat];
  const leadSuit = state.currentTrick.length
    ? state.currentTrick[0].card.suit
    : null;

  const v = validateMove({ leadSuit, hakemSuit: state.hakemSuit, hand, card });
  if (!v.valid) throw new Error(v.reason);

  // حذف کارت از دست
  const idx = hand.findIndex((c) => c.suit === card.suit && c.rank === card.rank);
  hand.splice(idx, 1);

  state.currentTrick.push({ seat, card });
  if (state.currentTrick.length === 1) state.leadSeat = seat;

  if (state.currentTrick.length === 4) {
    return resolveTrick(state);
  }

  state.turnSeat = (state.turnSeat + 1) % 4;
  return state;
}

// تشخیص برنده‌ی دست و پیشبرد به دست بعدی یا پایان کد
function resolveTrick(state) {
  const leadSuit = state.currentTrick[0].card.suit;
  const winner = trickWinner({
    plays: state.currentTrick,
    leadSuit,
    hakemSuit: state.hakemSuit,
  });

  state.teamTricks = applyTrickResult(state.teamTricks, winner);
  state.lastWinner = winner;
  state.lastPlays = state.currentTrick.slice(); // برای ثبت در جدول tricks
  state.trickNo += 1;

  // پاکسازی دست
  state.currentTrick = [];
  state.leadSeat = null;

  // بررسی پایان کد: بازی همیشه ۱۳ دست کامل بازی می‌شود
  // (برنده کد = تیمی که بیشترین دست را برده؛ حداقل ۷)
  if (roundComplete(state.trickNo)) {
    return endRound(state);
  }

  state.turnSeat = winner; // برنده دست بعدی شروع می‌کند
  state.leadSeat = winner;
  return state;
}

// پایان یک کد: بروزرسانی امتیاز کدها، بررسی پایان بازی
function endRound(state) {
  const winnerTeam = decideRound(state.teamTricks, state.flags);
  if (winnerTeam !== null) {
    state.teamRounds[winnerTeam] += 1;
  }
  state.phase = 'round_over';

  // بررسی پایان کل بازی
  const matchWin = require('./rules').matchWinner(
    [state.teamRounds[0], state.teamRounds[1]],
    state.flags.roundsToWin
  );
  if (matchWin !== null) {
    state.phase = 'match_over';
    state.matchWinner = matchWin;
  }
  return state;
}

// شروع کد بعدی (بعد از round_over) - حاکم چرخش می‌کند
function nextRound(state) {
  if (state.phase !== 'round_over') throw new Error('not_round_over');
  // ریست امتیازات دست، چرخش حاکم به نفر بعد
  state.teamTricks = { 0: 0, 1: 0 };
  state.trickNo = 0;
  state.lastWinner = null;
  state.currentTrick = [];
  state.phase = 'deal';
  // حاکم بعدی (اختیاری: می‌تواند بر اساس قانون بازی تغییر کند)
  state.hakemSeat = (state.hakemSeat + 1) % 4;
  return state;
}

// serialize برای ذخیره در دیتابیس (شامل _remaining برای توزیع دور دوم)
function serialize(state) {
  return JSON.stringify(state);
}

function deserialize(json) {
  return JSON.parse(json);
}

module.exports = {
  createMatchState,
  dealFirstPhase,
  chooseHakemSuit,
  playCard,
  resolveTrick,
  endRound,
  nextRound,
  serialize,
  deserialize,
};
