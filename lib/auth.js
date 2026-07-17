const crypto = require('crypto');

function validateInitData(initData, botToken) {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const sorted = [];
  for (const [k, v] of params) sorted.push(k + '=' + v);
  sorted.sort();
  const dataCheckString = sorted.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  try {
    return JSON.parse(params.get('user'));
  } catch { return null; }
}

module.exports = { validateInitData };
