import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const dir = process.env.EZYCAF_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
fs.mkdirSync(dir, { recursive: true });
const codeFile = path.join(dir, 'staff-access.txt');
if (!fs.existsSync(codeFile)) fs.writeFileSync(codeFile, crypto.randomBytes(12).toString('hex'), { mode: 0o600, flag: 'wx' });
if (process.platform === 'win32') {
  const identity = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
  const sid = identity.match(/S-1-\d+(?:-\d+)+/)?.[0];
  if (!sid) throw new Error('Cannot determine the staff-code file owner.');
  execFileSync('icacls', [codeFile, '/inheritance:r', '/grant:r', `*${sid}:F`], { stdio: 'ignore', windowsHide: true });
} else fs.chmodSync(codeFile, 0o600);
export function getStaffAccessCode() { return fs.readFileSync(codeFile, 'utf8').trim(); }
const expected = crypto.createHash('sha256').update(fs.readFileSync(codeFile, 'utf8').trim()).digest();
const sessions = new Map();
const rates = new Map();
export function limit(key, maximum, interval = 60000) {
  const now = Date.now();
  let rate = rates.get(key);
  if (!rate || now >= rate.until) { rate = { count: 0, until: now + interval }; rates.set(key, rate); }
  return ++rate.count <= maximum;
}
function sessionId(req) { return /(?:^|;\s*)ezycaf_staff=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1]; }
export function staff(req) { return (sessions.get(sessionId(req)) || 0) > Date.now(); }
export function requireStaff(req, res, next) {
  if (!staff(req)) return res.status(401).json({ error: 'Staff sign-in required.' });
  next();
}
export function installStaffRoutes(app, io) {
  app.get('/api/staff/session', (req, res) => res.json({ authenticated: staff(req) }));
  app.post('/api/staff/login', (req, res) => {
    if (!limit(`login:${req.socket.remoteAddress}`, 5)) return res.status(429).json({ error: 'Too many attempts. Wait a minute.' });
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    const supplied = crypto.createHash('sha256').update(code).digest();
    if (!crypto.timingSafeEqual(supplied, expected)) return res.status(401).json({ error: 'Incorrect staff access code.' });
    if (sessions.size >= 1000) return res.status(503).json({ error: 'Session limit reached.' });
    const id = crypto.randomBytes(32).toString('hex');
    sessions.set(id, Date.now() + 8 * 3600000);
    res.set('Set-Cookie', `ezycaf_staff=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`);
    res.json({ ok: true });
  });
  app.post('/api/staff/logout', (req, res) => {
    const id = sessionId(req); sessions.delete(id);
    for (const socket of io.sockets.sockets.values()) if (sessionId(socket.request) === id) socket.disconnect(true);
    res.set('Set-Cookie', 'ezycaf_staff=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    res.json({ ok: true });
  });
}
setInterval(() => {
  const now = Date.now();
  for (const [id, until] of sessions) if (until <= now) sessions.delete(id);
  for (const [key, rate] of rates) if (rate.until <= now) rates.delete(key);
}, 60000).unref();
export function headers(req, res, next) {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" });
  if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
  next();
}
