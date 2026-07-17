const express = require('express');
const path = require('path');
const { createDb } = require('./lib/supabase');
const { validateInitData } = require('./lib/auth');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-init-data');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const apiHandler = require('./handlers/api');
const messageHandler = require('./handlers/message');
const { api } = require('./lib/supabase-api');

app.post('/api', async (req, res) => {
  try {
    const botToken = process.env.BOT_TOKEN;
    const initData = req.body.initData || req.headers['x-init-data'] || '';
    const user = botToken ? validateInitData(initData, botToken) : null;
    const db = createDb();
    const ctx = {
      request: {
        method: 'POST',
        body: req.body,
        headers: { 'x-init-data': initData },
      },
      db,
      json(obj, status = 200) {
        res.status(status).json(obj);
      },
      validatedUser: user,
    };
    await apiHandler(ctx);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    const db = createDb();
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    const ctx = {
      message: update.message || null,
      callbackQuery: update.callback_query || null,
      db,
      reply(text, opts = {}) {
        if (!chatId) return Promise.reject(new Error('no chat'));
        return api.sendMessage({ chat_id: chatId, text, ...opts });
      },
      answerCallbackQuery(p) {
        const cqId = update.callback_query?.id;
        if (!cqId) return Promise.reject(new Error('no callback_query'));
        return api.answerCallbackQuery({ callback_query_id: cqId, ...(typeof p === 'string' ? { text: p } : p || {}) });
      },
      editMessageText(text, opts = {}) {
        if (!chatId) return Promise.reject(new Error('no chat'));
        return api.editMessageText({ chat_id: chatId, message_id: update.callback_query?.message?.message_id, text, ...opts });
      },
    };

    if (update.message) {
      ctx.message = update.message;
      await messageHandler(ctx);
    }
    if (update.callback_query) {
      ctx.callbackQuery = update.callback_query;
      const cbHandler = require('./handlers/callback_query');
      await cbHandler(ctx);
    }
    if (update.successful_payment) {
      const payHandler = require('./handlers/successful_payment');
      await payHandler(ctx);
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('webhook error', e);
    res.sendStatus(200);
  }
});

app.use(express.static(path.join(__dirname, 'webapp')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'webapp', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
