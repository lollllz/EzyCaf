import express from 'express';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { Server } from 'socket.io';

const token = process.env.RELAY_TOKEN;
if (!token || token.length < 32) throw new Error('RELAY_TOKEN must be a unique secret of at least 32 characters.');
const dataDir = process.env.RELAY_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'relay.db'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY, json TEXT NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, payload TEXT NOT NULL, result TEXT, created INTEGER NOT NULL);`);
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
const server = createServer(app);
const io = new Server(server, { maxHttpBufferSize: 32768, allowRequest: (req, cb) => {
  try { cb(null, !req.headers.origin || new URL(req.headers.origin).host === req.headers.host); } catch { cb(null, false); }
} });
const snapshot = () => { const row = db.prepare('SELECT * FROM snapshot WHERE id = 1').get(); return row ? { ...JSON.parse(row.json), online: Date.now() - row.updated < 15000 } : { tables: [], menu: [], brand: { name: 'EzyCaf', accent: '#215C47', logoUrl: '' }, online: false }; };
const hello = () => { const s = snapshot(); return { tables: s.tables, brand: s.brand, networkMode: 'customer-relay', cafeOnline: s.online, baseUrl: '' }; };
function authorize(req, res, next) {
  const supplied = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${token}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
app.use('/relay', authorize);
app.get('/relay/health', (_req, res) => res.json({ service: 'ezycaf-customer-relay', ok: true }));
app.post('/relay/snapshot', (req, res) => {
  const { tables, menu, brand } = req.body || {};
  if (!Array.isArray(tables) || !Array.isArray(menu) || !brand) return res.status(400).json({ error: 'Invalid snapshot' });
  // Never publish host settings, tokens, customer notes, order lists or local logo paths.
  const safe = { tables: tables.map(({ id, label }) => ({ id, label })), menu: menu.filter((m) => m.available).map(({ id, name, description, price, category, available, sortOrder }) => ({ id, name, description, price, category, available, sortOrder })), brand: { name: brand.name, accent: brand.accent, logoUrl: '' } };
  db.prepare('INSERT INTO snapshot VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET json=excluded.json, updated=excluded.updated').run(JSON.stringify(safe), Date.now());
  io.emit('hub:hello', hello()); io.emit('menu:updated', safe.menu);
  res.json({ ok: true });
});
app.get('/relay/orders', (_req, res) => {
  db.prepare("UPDATE requests SET result = ? WHERE result IS NULL AND created < ?").run(JSON.stringify({ ok: false, error: 'Order expired before reaching the cafe. Please ask staff before retrying.' }), Date.now() - 120000);
  res.json(db.prepare('SELECT id, payload FROM requests WHERE result IS NULL ORDER BY created LIMIT 50').all().map((r) => ({ id: r.id, payload: JSON.parse(r.payload) })));
});
app.post('/relay/orders/:id', (req, res) => {
  if (typeof req.body?.ok !== 'boolean') return res.status(400).json({ error: 'Invalid result' });
  db.prepare('UPDATE requests SET result = ? WHERE id = ? AND result IS NULL').run(JSON.stringify(req.body), req.params.id);
  res.json({ ok: true });
});
app.get('/api/hub', (_req, res) => res.json(hello()));
app.get('/api/menu', (_req, res) => res.json(snapshot().menu));
// No staff REST or staff socket handlers exist on this service.
app.use('/api', (_req, res) => res.status(403).json({ error: 'Staff access is available only on the cafe network.' }));
setInterval(() => io.emit('hub:hello', hello()), 2000).unref();
const rates = new Map();
function allowOrder(ip) {
  const now = Date.now(); const previous = rates.get(ip) || [];
  const recent = previous.filter((t) => now - t < 60000);
  if (recent.length >= 10) return false;
  recent.push(now); rates.set(ip, recent); return true;
}
setInterval(() => { const now = Date.now(); for (const [ip, times] of rates) if (times.every((t) => now - t >= 60000)) rates.delete(ip); db.prepare('DELETE FROM requests WHERE result IS NOT NULL AND created < ?').run(now - 86400000); }, 60000).unref();
io.on('connection', (socket) => {
  socket.emit('hub:hello', hello()); socket.emit('menu:updated', snapshot().menu);
  socket.on('order:create', async (payload, ack) => {
    if (typeof ack !== 'function') return;
    const id = payload?.requestId;
    if (typeof id !== 'string' || !/^q_[0-9a-f-]{36}$/.test(id)) return ack({ ok: false, error: 'Invalid order reference' });
    const existing = db.prepare('SELECT * FROM requests WHERE id=?').get(id);
    if (existing?.result) return ack(JSON.parse(existing.result));
    if (!existing) {
      if (!allowOrder(process.env.RELAY_TRUST_PROXY === '1' ? String(socket.handshake.headers['x-forwarded-for'] || socket.handshake.address).split(',').pop().trim() : socket.handshake.address)) return ack({ ok: false, error: 'Too many orders. Please wait a minute.' });
      const current = snapshot();
      if (!current.online) return ack({ ok: false, error: 'The cafe is offline. Please order with staff.' });
      if (!current.tables.some((t) => t.id === payload.tableId) || !Array.isArray(payload.items) || !payload.items.length || payload.items.length > 100 || payload.items.some((i) => !current.menu.some((m) => m.id === i.id) || !Number.isInteger(i.qty) || i.qty < 1 || i.qty > 99)) return ack({ ok: false, error: 'Review your table and cart.' });
      const safe = { tableId: payload.tableId, items: payload.items.map(({ id, qty }) => ({ id, qty })), note: String(payload.note || '').slice(0, 200) };
      db.prepare('INSERT INTO requests (id,payload,created) VALUES (?,?,?)').run(id, JSON.stringify(safe), Date.now());
    }
    // Acknowledge success only after SQLite on the cafe hub accepted the order.
    for (let i = 0; i < 40; i++) {
      const row = db.prepare('SELECT result FROM requests WHERE id=?').get(id);
      if (row?.result) return ack(JSON.parse(row.result));
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    ack({ ok: false, error: 'Confirmation is delayed. Try again with the same cart or ask staff; do not create a different order.' });
  });
  for (const event of ['order:status', 'table:clear']) socket.on(event, (_payload, ack) => { if (typeof ack === 'function') ack({ ok: false, error: 'Staff access is local only.' }); });
});
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');
app.use('/assets', express.static(path.join(dist, 'assets')));
app.get('/t/:tableId', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
app.get('/', (_req, res) => res.type('html').send('<!doctype html><meta name="viewport" content="width=device-width"><title>EzyCaf</title><p>Scan your table QR to open the cafe menu.</p>'));
server.listen(Number(process.env.PORT) || 8080, '0.0.0.0', () => console.log('EzyCaf customer service started'));
