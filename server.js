// server.js
// سرور لوکال برای تست یکپارچه Mini App + API (بدون tgcloud)
// روی پلتفرم واقعی این فایل نیاز نیست - فقط برای دیپلوی محلی/تست است.
//
// اجرا: node server.js  ->  http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');

// استفاده از stub لوکال sdk/db (node_modules/sdk/db.js)
const schema = require('./schema');
for (const [k, v] of Object.entries(schema)) v._name = k;

// یک دیتابیس در حافظه ساده (مشابه stub تست)
const store = new Map();
let autoId = 1;
function table(n) { if (!store.has(n)) store.set(n, []); return store.get(n); }
const db = {
  select(tbl) {
    const rows = table(tbl._name);
    const q = {
      _rows: rows,
      where(f, v) { this._rows = this._rows.filter((r) => r[f] === v); return this; },
      orderBy(f) { this._rows = this._rows.slice().sort((a, b) => a[f] - b[f]); return this; },
      first() { return this._rows[0] || null; },
      all() { return this._rows; },
    };
    return q;
  },
  insert(tbl, row) { const rows = table(tbl._name); const r = { ...row, id: autoId++ }; rows.push(r); return r; },
  update(tbl) {
    const rows = table(tbl._name);
    return {
      where(f, v) { this._t = rows.filter((r) => r[f] === v); return this; },
      set(p) { this._t.forEach((r) => Object.assign(r, p)); return this._t; },
    };
  },
  delete(tbl) {
    const rows = table(tbl._name);
    return { where(f, v) { store.set(tbl._name, rows.filter((r) => r[f] !== v)); return this; } };
  },
};

const apiHandler = require('./handlers/api');

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      let parsed = {};
      try { parsed = JSON.parse(body || '{}'); } catch (e) {}
      // initData را از هدر یا بدنه بگیر (برای تست لوکال userId عددی است)
      const initData = parsed.initData || req.headers['x-init-data'] || '1';
      const ctx = {
        request: { method: 'POST', body: parsed, headers: { 'x-init-data': initData } },
        db,
        json(obj, status = 200) {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(obj));
        },
      };
      try {
        await apiHandler(ctx);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // سرو فایل‌های استاتیک webapp/
  let filePath = path.join(__dirname, 'webapp', url.pathname === '/' ? 'index.html' : url.pathname);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Mini App تست روی http://localhost:${PORT}  (initData=1 برای کاربر دمو)`);
});
