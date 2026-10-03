const crypto = require('crypto');

const HARDCODED_CREATOR_SECRET = 'admin123';
const COOKIE_NAME = 'pv_creator';
const SESSION_MS = 8 * 60 * 60 * 1000;
const attempts = globalThis.__pandavaultCreatorAttempts || new Map();
globalThis.__pandavaultCreatorAttempts = attempts;

function send(res, status, body, extraHeaders = {}) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  Object.entries(extraHeaders).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(body));
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(x => x.trim()).filter(Boolean).map(x => {
    const i = x.indexOf('=');
    return i < 0 ? [x, ''] : [x.slice(0, i), decodeURIComponent(x.slice(i + 1))];
  }));
}

function sign(value) {
  return crypto.createHmac('sha256', HARDCODED_CREATOR_SECRET).update(value).digest('hex');
}

function makeToken() {
  const payload = `${Date.now() + SESSION_MS}.${crypto.randomBytes(18).toString('hex')}`;
  return `${payload}.${sign(payload)}`;
}

function validToken(token) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expires, nonce, mac] = parts;
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  const expected = sign(`${expires}.${nonce}`);
  return mac.length === expected.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}

function clientKey(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

module.exports = (req, res) => {
  const method = req.method || 'GET';
  const cookies = parseCookies(req);

  if (method === 'GET') return send(res, 200, { authenticated: validToken(cookies[COOKIE_NAME]) });

  if (method === 'DELETE') {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    return send(res, 200, { authenticated: false });
  }

  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  const key = clientKey(req);
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter(t => now - t < 10 * 60 * 1000);
  if (recent.length >= 8) {
    attempts.set(key, recent);
    return send(res, 429, { error: 'Too many attempts' });
  }
  recent.push(now);
  attempts.set(key, recent);

  let body = {};
  try {
    body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}');
  } catch {
    body = {};
  }

  if (String(body.code || '') !== HARDCODED_CREATOR_SECRET) return send(res, 401, { error: 'Invalid creator code' });

  const token = makeToken();
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${Math.floor(SESSION_MS / 1000)}; Path=/; HttpOnly; SameSite=Lax${secure}`);
  return send(res, 200, { authenticated: true });
};
