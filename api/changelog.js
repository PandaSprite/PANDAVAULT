const crypto = require('crypto');
const { put, get } = require('@vercel/blob');

const HARDCODED_CREATOR_SECRET = 'admin123';
const COOKIE_NAME = 'pv_creator';
const BLOB_PATH = 'pandavault/changelog.json';

const DEFAULT_ENTRIES = [
  { id: 'v1-0-0', version: '1.0.0', date: '2026-10-01', title: 'Initial PandaVault release', changes: ['PandaVault mod showcase foundation.', 'Responsive navigation and creator tools.'] },
  { id: 'v1-1-0', version: '1.1.0', date: '2026-10-02', title: 'PandaPorter and Test Lab', changes: ['Added The PandaPorter!', 'Added the built-in Character Porter Test Lab.'] },
  { id: 'v1-2-0', version: '1.2.0', date: '2026-10-03', title: 'Porter Test Lab Improvements', changes: ['Added semantic comparison and clearer port diagnostics.', 'Added Articles management and persistent creator publishing.'] }
];

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(x => x.trim()).filter(Boolean).map(x => {
    const i = x.indexOf('=');
    return i < 0 ? [x, ''] : [x.slice(0, i), decodeURIComponent(x.slice(i + 1))];
  }));
}
function sign(value) { return crypto.createHmac('sha256', HARDCODED_CREATOR_SECRET).update(value).digest('hex'); }
function isAdmin(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expires, nonce, mac] = parts;
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  const expected = sign(`${expires}.${nonce}`);
  return mac.length === expected.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}
async function readEntries() {
  try {
    const blob = await get(BLOB_PATH, { access: 'private', useCache: false });
    if (!blob) return DEFAULT_ENTRIES;
    const text = await new Response(blob.stream).text();
    const data = JSON.parse(text);
    return Array.isArray(data.entries) ? data.entries : DEFAULT_ENTRIES;
  } catch {
    return DEFAULT_ENTRIES;
  }
}
function cleanEntry(input, fallbackId) {
  const changes = Array.isArray(input?.changes) ? input.changes.map(x => String(x || '').trim()).filter(Boolean).slice(0, 30) : [];
  const version = String(input?.version || '').trim().slice(0, 40);
  const date = String(input?.date || '').trim().slice(0, 20);
  const title = String(input?.title || '').trim().slice(0, 160);
  if (!version || !date || !title || !changes.length) return null;
  return { id: String(input?.id || fallbackId || crypto.randomUUID()), version, date, title, changes };
}
async function writeEntries(entries) {
  await put(BLOB_PATH, JSON.stringify({ entries }, null, 2), { access: 'private', allowOverwrite: true, contentType: 'application/json' });
}

module.exports = async (req, res) => {
  const method = req.method || 'GET';
  const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
  const parts = url.pathname.split('/').filter(Boolean);
  const id = parts.length >= 3 ? decodeURIComponent(parts[2]) : null;

  if (method === 'GET') return send(res, 200, { entries: await readEntries() });
  if (!isAdmin(req)) return send(res, 401, { error: 'Creator authentication required' });

  let body = {};
  try { body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}'); } catch { body = {}; }
  let entries = await readEntries();

  if (method === 'POST') {
    const entry = cleanEntry(body, crypto.randomUUID());
    if (!entry) return send(res, 400, { error: 'Version, date, title, and changes are required' });
    entries = [...entries, entry];
    await writeEntries(entries);
    return send(res, 200, { entry });
  }

  if (method === 'PUT' && id) {
    const index = entries.findIndex(x => String(x.id) === id);
    if (index < 0) return send(res, 404, { error: 'Article not found' });
    const entry = cleanEntry({ ...entries[index], ...body, id: entries[index].id }, entries[index].id);
    if (!entry) return send(res, 400, { error: 'Invalid article' });
    entries[index] = entry;
    await writeEntries(entries);
    return send(res, 200, { entry });
  }

  if (method === 'DELETE' && id) {
    const next = entries.filter(x => String(x.id) !== id);
    if (next.length === entries.length) return send(res, 404, { error: 'Article not found' });
    await writeEntries(next);
    return send(res, 200, { entries: next });
  }

  if (method === 'PUT') {
    if (!Array.isArray(body.entries)) return send(res, 400, { error: 'Entries array required' });
    const cleaned = body.entries.map((x, i) => cleanEntry(x, `entry-${i}`)).filter(Boolean);
    if (cleaned.length !== body.entries.length) return send(res, 400, { error: 'Invalid article in reorder payload' });
    await writeEntries(cleaned);
    return send(res, 200, { entries: cleaned });
  }

  return send(res, 405, { error: 'Method not allowed' });
};
