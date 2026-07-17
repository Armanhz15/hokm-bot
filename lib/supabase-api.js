const https = require('https');

function botApi(method, params) {
  return new Promise((resolve, reject) => {
    const token = process.env.BOT_TOKEN;
    if (!token) return reject(new Error('BOT_TOKEN not set'));
    const body = JSON.stringify(params);
    const req = https.request(
      `https://api.telegram.org/bot${token}/${method}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.ok) resolve(j.result);
            else reject(new Error(j.description || 'telegram_api_error'));
          } catch { reject(new Error(data)); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const api = {
  sendMessage: (p) => botApi('sendMessage', p),
  answerCallbackQuery: (p) => botApi('answerCallbackQuery', p),
  editMessageText: (p) => botApi('editMessageText', p),
};

module.exports = { api };
