const crypto = require('crypto');

function validateInitData(initData, botToken) {
  if (!initData || !botToken) return null;

  const pairs = initData.split('&').map((p) => {
    const eq = p.indexOf('=');
    return { key: eq > 0 ? p.slice(0, eq) : p, value: eq > 0 ? p.slice(eq + 1) : '' };
  });

  let hash = '';
  const items = [];
  for (const p of pairs) {
    if (p.key === 'hash') {
      hash = decodeURIComponent(p.value);
    } else {
      items.push(p.key + '=' + p.value);
    }
  }
  if (!hash) return null;

  items.sort();
  const dataCheckString = items.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const userPair = pairs.find((p) => p.key === 'user');
  return userPair ? JSON.parse(decodeURIComponent(userPair.value)) : null;
}

module.exports = { validateInitData };
