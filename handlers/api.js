// handlers/api.js
// اندپوینت اختصاصی Mini App: ساخت میز، بازی کارت، دیدن وضعیت
// قرارداد Telegram Serverless: export default async function (ctx) {}
// ctx شامل: ctx.request (method, body, headers), ctx.db, و تابع پاسخ (ctx.json)
//
// احراز هویت: هر درخواست باید initData (Telegram Web App) داشته باشد.
// روی پلتفرم واقعی: await sdk.validateInitData(initData) -> { user }
// اینجا یک wrapper ساده می‌زنیم که روی stub لوکال کار کند.

const { tables, tableSeats, rounds, tricks, users, queue } = require('../schema');
const { createMatchState, dealFirstPhase, chooseHakemSuit, playCard, nextRound, serialize, deserialize } = require('../lib/engine');
const { createPrivateTable, joinPrivateTable, joinPublicQueue, getTableSeats, lockTableWagers, settleTableWagers, getLeaderboard, getUserHistory } = require('../lib/rooms');
const { getBalance, purchaseWithStars } = require('../lib/wallet');
const { teamOf } = require('../lib/rules');

async function authUser(ctx) {
  if (ctx.validatedUser && ctx.validatedUser.id) return ctx.validatedUser.id;
  const initData = (ctx.request.body && ctx.request.body.initData) ||
    (ctx.request.headers && ctx.request.headers['x-init-data']);
  if (!initData) throw new Error('unauthorized');
  // fallback برای تست لوکال (initData می‌تواند userId عددی یا query string باشد)
  const userId = parseInt(initData, 10);
  if (userId) return userId;
  try {
    const p = new URLSearchParams(initData);
    const user = JSON.parse(p.get('user'));
    if (user && user.id) return user.id;
  } catch (_) {}
  throw new Error('unauthorized');
}

// یافتن میز فعال یک کاربر
async function findUserTable(db, userId) {
  const seat = await db.select(tableSeats).where('user_id', userId).first();
  if (!seat) return null;
  const t = await db.select(tables).where('id', seat.table_id).first();
  return t && t.status !== 'finished' ? t : null;
}

// بارگذاری state میز از ردیف rounds (آخرین round فعال)
async function loadState(db, tableId) {
  const all = await db.select(rounds).where('table_id', tableId).all();
  const active = all.filter((x) => x.status === 'active').pop() || all[all.length - 1];
  if (!active) return null;
  const state = active.state_json ? deserialize(active.state_json) : null;
  return { round: active, state };
}

async function saveState(db, round, state) {
  await db.update(rounds).where('id', round.id).set({
    state_json: serialize(state),
    turn_seat: state.turnSeat,
    team0_tricks: state.teamTricks[0],
    team1_tricks: state.teamTricks[1],
  });
}

// پیدا کردن شماره صندلی کاربر در state
function seatOf(state, userId) {
  if (!state || !state.seats) return -1;
  return state.seats.indexOf(userId);
}

module.exports = async function api(ctx) {
  let userId;
  try {
    userId = await authUser(ctx);
  } catch (e) {
    return ctx.json({ error: e.message }, 401);
  }

  const { action, payload = {} } = ctx.request.body || {};

  try {
    switch (action) {
      // ---- لابی ----
      case 'join_public_queue': {
        const wager = parseInt(payload.wager, 10) || 0;
        const res = await joinPublicQueue(ctx.db, { userId, wager });
        if (res.started) return ctx.json({ table: res.table, started: true });
        return ctx.json({ started: false, inQueue: true });
      }

      case 'create_private': {
        const wager = parseInt(payload.wager, 10) || 0;
        const t = await createPrivateTable(ctx.db, { userId, wager });
        return ctx.json({ table: t });
      }

      case 'join_private_code': {
        const t = await joinPrivateTable(ctx.db, { userId, code: payload.code });
        return ctx.json({ table: t });
      }

      // ---- وضعیت ----
      case 'get_state': {
        const t = await findUserTable(ctx.db, userId);
        if (!t) return ctx.json({ error: 'no_table' }, 404);
        const seats = await getTableSeats(ctx.db, t.id);
        const loaded = await loadState(ctx.db, t.id);
        return ctx.json({
          table: { id: t.id, code: t.code, type: t.type, wager: t.wager, status: t.status },
          seats,
          state: loaded ? loaded.state : null,
        });
      }

      // ---- شروع بازی ----
      case 'start_match': {
        const t = await findUserTable(ctx.db, userId);
        if (!t) return ctx.json({ error: 'no_table' }, 404);
        const seats = await getTableSeats(ctx.db, t.id);
        if (seats.length !== 4) return ctx.json({ error: 'not_full' }, 400);

        // قفل شرط‌بندی (escrow) اگر میز شرط‌بندی باشد
        if (t.wager > 0) {
          // بررسی موجودی همه‌ی بازیکنان
          for (const s of seats) {
            const bal = await getBalance(ctx.db, s.user_id);
            if (bal < t.wager) {
              return ctx.json({ error: 'insufficient_balance', userId: s.user_id }, 400);
            }
          }
          await lockTableWagers(ctx.db, { tableId: t.id, seats, wager: t.wager });
        }

        const flags = payload.flags || {};
        const state = createMatchState({ seats: seats.map((s) => s.user_id), flags });
        dealFirstPhase(state);
        const round = await ctx.db.insert(rounds, {
          table_id: t.id,
          round_no: 1,
          hakem_seat: state.hakemSeat,
          turn_seat: state.turnSeat,
          team0_tricks: 0,
          team1_tricks: 0,
          status: 'active',
          state_json: serialize(state),
        });
        await ctx.db.update(tables).where('id', t.id).set({ status: 'playing' });
        return ctx.json({ ok: true, state });
      }

      // ---- انتخاب حکم ----
      case 'choose_suit': {
        const t = await findUserTable(ctx.db, userId);
        if (!t) return ctx.json({ error: 'no_table' }, 404);
        const loaded = await loadState(ctx.db, t.id);
        if (!loaded || !loaded.state) return ctx.json({ error: 'no_round' }, 400);
        const { round, state } = loaded;
        const seat = seatOf(state, userId);
        if (state.turnSeat !== seat) return ctx.json({ error: 'not_turn' }, 400);
        chooseHakemSuit(state, payload.suit);
        await saveState(ctx.db, round, state);
        return ctx.json({ ok: true, state });
      }

      // ---- بازی کارت ----
      case 'play_card': {
        const t = await findUserTable(ctx.db, userId);
        if (!t) return ctx.json({ error: 'no_table' }, 404);
        const loaded = await loadState(ctx.db, t.id);
        if (!loaded || !loaded.state) return ctx.json({ error: 'no_round' }, 400);
        const { round, state } = loaded;
        const seat = seatOf(state, userId);
        if (seat === -1) return ctx.json({ error: 'not_in_table' }, 400);
        playCard(state, seat, payload.card);
        await saveState(ctx.db, round, state);

        // ثبت trick در جدول tricks اگر دست کامل شد
        if (state.currentTrick.length === 0 && state.lastWinner !== null && state.lastPlays) {
          await ctx.db.insert(tricks, {
            round_id: round.id,
            trick_no: state.trickNo,
            lead_suit: state.lastPlays[0].card.suit,
            plays: JSON.stringify(state.lastPlays),
            winner_seat: state.lastWinner,
          });
        }

        // اگر کد تمام شد، برنده کد را در round ثبت کن
        if (state.phase === 'round_over' || state.phase === 'match_over') {
          await ctx.db.update(rounds).where('id', round.id).set({ status: 'done' });
        }

        // تسویه شرط‌بندی فقط وقتی کل بازی تمام شد
        if (state.phase === 'match_over') {
          await ctx.db.update(tables).where('id', t.id).set({ status: 'finished' });
          if (t.wager > 0 && state.matchWinner !== undefined) {
            const seats = await getTableSeats(ctx.db, t.id);
            const rakePct = Number(process.env.WAGER_RAKE_PCT || 0);
            await settleTableWagers(ctx.db, {
              tableId: t.id,
              winningTeam: state.matchWinner,
              seats,
              rakePct,
            });
          }
        }
        return ctx.json({ ok: true, state });
      }

      // ---- کد بعدی ----
      case 'next_round': {
        const t = await findUserTable(ctx.db, userId);
        if (!t) return ctx.json({ error: 'no_table' }, 404);
        const loaded = await loadState(ctx.db, t.id);
        if (!loaded || !loaded.state) return ctx.json({ error: 'no_round' }, 400);
        const { round, state } = loaded;
        nextRound(state);
        dealFirstPhase(state);
        const newRound = await ctx.db.insert(rounds, {
          table_id: t.id,
          round_no: (round.round_no || 1) + 1,
          hakem_seat: state.hakemSeat,
          turn_seat: state.turnSeat,
          team0_tricks: 0,
          team1_tricks: 0,
          status: 'active',
          state_json: serialize(state),
        });
        return ctx.json({ ok: true, state, roundId: newRound.id });
      }

      // ---- کیف پول ----
      case 'get_balance': {
        const bal = await getBalance(ctx.db, userId);
        return ctx.json({ balance: bal });
      }

      case 'buy_stars': {
        // خرید سکه با Telegram Stars (فقط ورودی - هیچ خروجی/cash-out وجود ندارد)
        // روی پلتفرم واقعی: ابتدا Stars invoice ساخته می‌شود، پس از پرداخت موفق
        // تلگرام وب‌هوک successful_payment می‌فرستد که اینجا پردازش می‌شود.
        const coins = parseInt(payload.coins, 10);
        if (!coins || coins <= 0) return ctx.json({ error: 'invalid_amount' }, 400);
        const invoiceId = payload.invoiceId || `stars_${userId}_${coins}_${Date.now()}`;
        const tx = await purchaseWithStars(ctx.db, {
          userId,
          stars: coins,
          coins,
          invoiceId,
        });
        const bal = await getBalance(ctx.db, userId);
        return ctx.json({ ok: true, balance: bal, txId: tx.id });
      }

      // ---- لیدربورد و تاریخچه ----
      case 'leaderboard': {
        const top = await getLeaderboard(ctx.db, payload.limit || 10);
        return ctx.json({ leaderboard: top });
      }

      case 'history': {
        const rows = await getUserHistory(ctx.db, userId, payload.limit || 20);
        return ctx.json({ history: rows });
      }

      default:
        return ctx.json({ error: 'unknown_action' }, 400);
    }
  } catch (e) {
    return ctx.json({ error: e.message }, 400);
  }
};
