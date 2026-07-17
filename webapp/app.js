// webapp/app.js
// منطق Mini App: احراز هویت اولیه، لابی، میز، polling وضعیت
// همه‌ی درخواست‌ها به اندپوینت api زده می‌شود (handlers/api.js)
// برای جدا کردن لایه‌ی real-time بعداً: فقط تابع poll() را با WebSocket جایگزین کنید.

(function () {
  const API_URL = window.API_URL || '/api'; // روی سرور میزبان Mini App تنظیم شود
  let initData = '';
  let currentTable = null;
  let myUserId = null;
  let mySeat = -1;
  let pollTimer = null;
  let prevState = null;

  // نماد خال‌ها
  const SUIT_SYMBOL = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  const RED_SUITS = ['hearts', 'diamonds'];

  // ---------- کمکی ----------
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

  function showScreen(id) {
    $all('.screen').forEach((s) => s.classList.remove('active'));
    $('#' + id).classList.add('active');
  }

  function setMsg(elId, text) {
    const el = $('#' + elId);
    if (el) el.textContent = text || '';
  }

  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  function faNum(n) { return String(n).replace(/[0-9]/g, (c) => FA_DIGITS[parseInt(c)]); }

  function showLoading(show) { $('#loading').classList.toggle('hidden', !show); }

  async function api(action, payload) {
    const body = { action, payload: payload || {}, initData };
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) throw new Error(data.error || 'server_error');
    return data;
  }

  function cardLabel(card) {
    const sym = SUIT_SYMBOL[card.suit];
    return card.rank + sym;
  }
  function isRed(suit) { return RED_SUITS.includes(suit); }

  // ---------- راه‌اندازی ----------
  function init() {
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.expand();
      initData = tg.initData || '';
      // شناسه کاربر از initData (روی پلتفرم واقعی توسط سرور تایید می‌شود)
      try {
        const p = new URLSearchParams(tg.initData);
        const user = JSON.parse(p.get('user') || '{}');
        myUserId = user.id;
      } catch (e) { /* دمو */ }
    }

    // جوین خودکار از روی لینک دعوت (?code=XXXXXX)
    const urlParams = new URLSearchParams(window.location.search);
    const inviteCode = urlParams.get('code');
    if (inviteCode) {
      $('#codeInput').value = inviteCode;
      // جوین خودکار بعد از لود شدن دکمه‌ها
      setTimeout(() => onJoinCode(), 300);
    }

    $('#btnPublic').addEventListener('click', onPublic);
    $('#btnPrivate').addEventListener('click', onPrivate);
    $('#btnBuy').addEventListener('click', onBuy);
    $('#btnJoinCode').addEventListener('click', onJoinCode);
    $('#btnCopyInvite').addEventListener('click', onCopyInvite);
    $('#btnShareInvite').addEventListener('click', onShareInvite);
    $('#btnLeave').addEventListener('click', onLeave);
    $('#btnLeaderboard').addEventListener('click', onLeaderboard);
    $('#btnHistory').addEventListener('click', onHistory);
    $('#btnLbBack').addEventListener('click', () => showScreen('lobby'));
    $('#btnHistBack').addEventListener('click', () => showScreen('lobby'));

    $all('.suit').forEach((b) => {
      b.addEventListener('click', () => onChooseSuit(b.dataset.suit));
    });

    showScreen('lobby');
    startPolling();
  }

  // ---------- لیدربورد و تاریخچه ----------
  async function onLeaderboard() {
    try {
      const data = await api('leaderboard', { limit: 20 });
      const list = $('#lbList');
      list.innerHTML = '';
      (data.leaderboard || []).forEach((row, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="rank">#${i + 1}</span>` +
          `<span>بازیکن ${row.user_id}</span>` +
          `<span class="stat">${row.wins} برد · ${row.losses} باخت · ${row.coins_won} 🪙</span>`;
        list.appendChild(li);
      });
      if (!data.leaderboard || data.leaderboard.length === 0) {
        list.innerHTML = '<li>هنوز بازی‌ای ثبت نشده</li>';
      }
      showScreen('leaderboard');
    } catch (e) {
      setMsg('lobbyMsg', 'خطا: ' + e.message);
    }
  }

  async function onHistory() {
    try {
      const data = await api('history', { limit: 20 });
      const list = $('#histList');
      list.innerHTML = '';
      (data.history || []).forEach((row) => {
        const li = document.createElement('li');
        const isWin = row.winner_team === (mySeat % 2); // تقریبی؛ سرور دقیق‌تر می‌کند
        li.innerHTML = `<span>میز #${row.table_id} · شرط ${row.wager} 🪙</span>` +
          `<span class="result ${isWin ? 'win' : 'lose'}">${isWin ? 'برد' : 'باخت'}</span>`;
        list.appendChild(li);
      });
      if (!data.history || data.history.length === 0) {
        list.innerHTML = '<li>تاریخچه‌ای موجود نیست</li>';
      }
      showScreen('history');
    } catch (e) {
      setMsg('lobbyMsg', 'خطا: ' + e.message);
    }
  }

  // ---------- لابی ----------
  async function onPublic() {
    setMsg('lobbyMsg', 'در صف مچ‌میکینگ...');
    // مچ‌میکینگ در سمت سرور از طریق هندلر callback_query یا اینجا انجام می‌شود
    // فرض: سرور public queue را مدیریت می‌کند؛ ما وضعیت را poll می‌کنیم
    try {
      await api('join_public_queue');
      pollLoop();
    } catch (e) {
      setMsg('lobbyMsg', 'خطا: ' + e.message);
    }
  }

  async function onPrivate() {
    try {
      const data = await api('create_private');
      currentTable = data.table;
      setMsg('lobbyMsg', 'اتاق ساخته شد. کد: ' + faNum(data.table.code));
      if (data.inviteLink) showInvite(data.inviteLink);
      enterTable();
    } catch (e) {
      setMsg('lobbyMsg', 'خطا: ' + e.message);
    }
  }

  function showInvite(link) {
    const box = $('#inviteBox');
    if (!box) return;
    $('#inviteLink').value = link;
    box.classList.remove('hidden');
  }

  function hideInvite() {
    const box = $('#inviteBox');
    if (box) box.classList.add('hidden');
  }

  async function onCopyInvite() {
    const link = $('#inviteLink').value;
    try {
      await navigator.clipboard.writeText(link);
      setMsg('lobbyMsg', 'لینک کپی شد!');
    } catch (_) {
      $('#inviteLink').select();
      setMsg('lobbyMsg', 'لینک را انتخاب و کپی کنید');
    }
  }

  async function onShareInvite() {
    const link = $('#inviteLink').value;
    const text = 'بیا با من حکم بازی کن! ' + link;
    if (window.Telegram && window.Telegram.WebApp) {
      // تلگرام Mini App: ارسال لینک از طریق دکمه share
      if (window.Telegram.WebApp.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent('بیا با من حکم بازی کن! 🃏'));
      } else {
        window.Telegram.WebApp.sendData ? window.Telegram.WebApp.sendData(text) : null;
      }
    } else if (navigator.share) {
      try { await navigator.share({ title: 'حکم 🃏', text, url: link }); } catch (_) {}
    } else {
      onCopyInvite();
    }
  }

  async function onJoinCode() {
    const code = $('#codeInput').value.trim();
    if (code.length !== 6) { setMsg('lobbyMsg', 'کد باید ۶ رقمی باشد'); return; }
    try {
      const data = await api('join_private_code', { code });
      currentTable = data.table;
      enterTable();
    } catch (e) {
      setMsg('lobbyMsg', 'خطا: ' + e.message);
    }
  }

  async function onBuy() {
    // هدایت به خرید Stars (در سرور مدیریت می‌شود)
    setMsg('lobbyMsg', 'در حال هدایت به پرداخت Stars...');
    if (window.Telegram && window.Telegram.WebApp) {
      // سرور یک لینک/دکمه پرداخت می‌دهد؛ اینجا صرفاً نمایش پیام
    }
  }

  // ---------- میز ----------
  function enterTable() {
    showScreen('table');
    pollLoop();
  }

  async function onLeave() {
    stopPolling();
    currentTable = null;
    prevState = null;
    showScreen('lobby');
    setMsg('lobbyMsg', '');
    startPolling();
  }

  async function onChooseSuit(suit) {
    try {
      await api('choose_suit', { suit });
      $('#suitPicker').classList.add('hidden');
      pollLoop();
    } catch (e) {
      setMsg('tableMsg', 'خطا: ' + e.message);
    }
  }

  async function onPlayCard(card) {
    try {
      await api('play_card', { card });
      pollLoop();
    } catch (e) {
      setMsg('tableMsg', 'خطا: ' + e.message);
    }
  }

  // ---------- رندر وضعیت ----------
  function renderState(data) {
    const { table, seats, state, isHost, inviteLink } = data;
    currentTable = table;
    mySeat = state ? state.seats.indexOf(myUserId) : -1;

    // نمایش لینک دعوت فقط برای هاست
    if (isHost && inviteLink) showInvite(inviteLink);
    else hideInvite();

    // صندلی‌ها
    $all('.seat').forEach((el) => {
      const seatIdx = parseInt(el.dataset.seat, 10);
      const seat = seats.find((s) => s.seat === seatIdx);
      const nameEl = el.querySelector('.name');
      const tricksEl = el.querySelector('.tricks');
      if (seat) {
        const isMe = seat.user_id === myUserId;
        nameEl.textContent = isMe ? 'شما' : 'بازیکن ' + faNum(seatIdx + 1);
        const team = seat.team === 0 ? 'تیم الف' : 'تیم ب';
        if (state) {
          const tt = state.teamTricks[seat.team] || 0;
          tricksEl.textContent = team + ' · ' + faNum(tt) + ' دست';
        } else {
          tricksEl.textContent = team;
        }
      } else {
        nameEl.textContent = 'خالی';
        tricksEl.textContent = '';
      }
      el.classList.toggle('active', state && state.turnSeat === seatIdx);
    });

    // اطلاعات حکم
    if (state && state.hakemSuit) {
      const hakemIsMe = state.seats[state.hakemSeat] === myUserId;
      const hakemName = hakemIsMe ? 'شما' : 'بازیکن ' + faNum(state.hakemSeat + 1);
      $('#hakemInfo').textContent = 'حکم: ' + SUIT_SYMBOL[state.hakemSuit] + ' · حاکم: ' + hakemName;
    } else {
      $('#hakemInfo').textContent = '';
    }

    // دست بازی‌شده (trick فعلی) در قالب ۲×۲ بر اساس صندلی
    const trickArea = $('#trickArea');
    trickArea.innerHTML = '';
    if (state && state.currentTrick) {
      // seat→grid: 1→(1,1), 3→(1,2), 0→(2,1), 2→(2,2)
      const seatGrid = { 0: [2, 1], 1: [1, 1], 2: [2, 2], 3: [1, 2] };
      state.currentTrick.forEach((p) => {
        const div = document.createElement('div');
        const rc = seatGrid[p.seat] || [2, 1];
        div.style.gridRow = rc[0];
        div.style.gridColumn = rc[1];
        div.className = 'trick-card' + (isRed(p.card.suit) ? ' red' : '');
        const r = document.createElement('span');
        r.className = 'rank'; r.textContent = p.card.rank;
        const s = document.createElement('span');
        s.className = 'suit'; s.textContent = SUIT_SYMBOL[p.card.suit];
        div.appendChild(r); div.appendChild(s);
        trickArea.appendChild(div);
      });
    }

    // وضعیت کلی
    if (!state) {
      $('#status').textContent = 'منتظر بازیکنان (' + faNum(seats.length) + '/۴)...';
      $('#hand').innerHTML = '';
      $('#suitPicker').classList.add('hidden');
      prevState = state;
      return;
    }

    if (state.phase === 'choose_hakem_suit') {
      if (state.turnSeat === mySeat) {
        $('#suitPicker').classList.remove('hidden');
        $('#status').textContent = '🤚 نوبت شماست: حکم را انتخاب کنید';
      } else {
        $('#suitPicker').classList.add('hidden');
        $('#status').textContent = `حاکم: بازیکن ${faNum(state.hakemSeat + 1)} در حال انتخاب حکم...`;
      }
      prevState = state;
      renderHand(state);
      return;
    }

    if (state.phase === 'round_over') {
      $('#status').textContent = '🏆 کد تمام شد!';
      $('#suitPicker').classList.add('hidden');
      renderHand(state);
      prevState = state;
      return;
    }

    if (state.phase === 'match_over') {
      const myTeam = mySeat >= 0 ? state.seats.indexOf(myUserId) % 2 : -1;
      const won = state.matchWinner === myTeam;
      $('#status').textContent = won ? '🎉 شما بردید!' : '😔 شما باختید';
      $('#suitPicker').classList.add('hidden');
      renderHand(state);
      prevState = state;
      return;
    }

    $('#suitPicker').classList.add('hidden');

    // وضعیت نوبت
    if (state.turnSeat === mySeat) {
      $('#status').textContent = '🤚 نوبت شما';
    } else {
      const who = state.seats[state.turnSeat] === myUserId ? 'شما' : 'بازیکن ' + faNum(state.turnSeat + 1);
      $('#status').textContent = `منتظر ${who}...`;
    }

    // دست بازیکن
    renderHand(state);
    prevState = state;
  }

  function renderHand(state) {
    const handEl = $('#hand');
    handEl.innerHTML = '';
    if (mySeat < 0) return;
    const hand = state.hands[mySeat] || [];
    const leadSuit = state.currentTrick.length ? state.currentTrick[0].card.suit : null;
    const isMyTurn = state.turnSeat === mySeat && state.phase === 'playing';

    hand.forEach((card, idx) => {
      const el = document.createElement('div');
      el.className = 'card' + (isRed(card.suit) ? ' red' : '');
      el.style.zIndex = idx + 1;
      const rankSpan = document.createElement('span');
      rankSpan.className = 'rank';
      rankSpan.textContent = card.rank;
      const suitSpan = document.createElement('span');
      suitSpan.className = 'suit';
      suitSpan.textContent = SUIT_SYMBOL[card.suit];
      el.appendChild(rankSpan);
      el.appendChild(suitSpan);
      const followsLead = !leadSuit || card.suit === leadSuit;
      const playable = isMyTurn && followsLead;
      if (playable) el.classList.add('playable');
      else el.classList.add('disabled');
      if (playable) {
        el.addEventListener('click', () => onPlayCard(card));
      }
      handEl.appendChild(el);
    });
  }

  // ---------- polling ----------
  let initialLoad = true; // لودینگ فقط برای اولین بارگذاری نشان داده شود
  async function pollOnce() {
    const isInitial = initialLoad;
    if (isInitial) showLoading(true);
    try {
      // بروزرسانی موجودی در لابی
      if (!currentTable) {
        try {
          const balData = await api('get_balance');
          $('#coinBalance').textContent = faNum(balData.balance);
        } catch (_) {}
        return;
      }
      const data = await api('get_state');
      if (data.error === 'no_table') {
        if (currentTable) { stopPolling(); showScreen('lobby'); }
        return;
      }
      // بازخورد لمسی تلگرام وقتی نوبت عوض می‌شود
      if (prevState && data.state && prevState.turnSeat !== data.state.turnSeat &&
          data.state.turnSeat === mySeat) {
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
        }
      }
      renderState(data);
    } catch (e) {
      // خطای شبکه: نادیده بگیر
    } finally {
      // لودینگ فقط بعد از اولین بارگذاری موفق/ناموفق پنهان شود و دیگر تکرار نشود
      if (isInitial) { showLoading(false); initialLoad = false; }
    }
  }

  function pollLoop() {
    startPolling();
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(pollOnce, 1500); // هر ۱.۵ ثانیه
    pollOnce();
  }
  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  // اجرا
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
