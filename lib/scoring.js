// lib/scoring.js
// امتیازدهی هر دست (trick) و پایان یک «کد» (round)
// منطق pure - بدون وابستگی به دیتابیس

const { trickWinner, roundWinner, teamOf } = require('./rules');

// ثبت نتیجه‌ی یک دست و برگرداندن امتیاز جدید تیم‌ها
// state.teamTricks به شکل { 0: n, 1: n } نگه داشته می‌شود
function applyTrickResult(teamTricks, winnerSeat) {
  const team = teamOf(winnerSeat);
  return {
    0: (teamTricks[0] || 0) + (team === 0 ? 1 : 0),
    1: (teamTricks[1] || 0) + (team === 1 ? 1 : 0),
  };
}

// آیا یک کد (۱۳ دست) تمام شده؟
function roundComplete(tricksPlayed) {
  return tricksPlayed >= 13;
}

// تعیین برنده‌ی کد با پرچم‌های قابل‌تنظیم
// flags: { target: 7, hakemKaput: false }
function decideRound(teamTricks, flags = {}) {
  const target = flags.target || 7;
  return roundWinner([teamTricks[0] || 0, teamTricks[1] || 0], target, {
    hakemKaput: !!flags.hakemKaput,
  });
}

module.exports = {
  applyTrickResult,
  roundComplete,
  decideRound,
};
