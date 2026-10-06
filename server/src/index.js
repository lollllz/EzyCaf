import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import QRCode from 'qrcode';
import crypto from 'crypto';

import {
  initDb,
  getSettings,
  setSetting,
  getTables,
  getMenu,
  upsertMenuItem,
  deleteMenuItem,
  updateOrderStatus,
  getActiveOrders,
  getOrdersByTable,
  clearTable,
  getAllOrdersForCashier,
  getPendingMenuDeletions,
  acknowledgeMenuDeletions,
  completeSetup,
  getRelayConfig,
} from './db.js';
import { getLanIp, getBaseUrl } from './lan.js';
import { acceptOrder } from './order-service.js';
import { startCustomerRelay } from './customer-relay.js';
import { allowedRequest } from './network-access.js';
import { syncMenuToSupabase } from './supabase-sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const UPLOADS = process.env.EZYCAF_UPLOAD_DIR || path.join(ROOT, 'uploads');
const CLIENT_DIST = path.join(ROOT, 'client', 'dist');
const PORT = Number(process.env.PORT) || 3847;

if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

initDb();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  allowRequest: (req, callback) => callback(null, allowedRequest(req)),
});

app.use((req, res, next) => {
  if (!allowedRequest(req)) return res.status(403).json({ error: 'Connect to the cafe Wi-Fi to use EzyCaf.' });
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(UPLOADS));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `logo-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif|svg\+xml)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image uploads allowed'));
  },
});

function brandPayload() {
  const s = getSettings();
  return {
    name: s.name,
    accent: s.accent,
    logoUrl: s.logoUrl,
  };
}

function hubHello() {
  return {
    tables: getTables(),
    baseUrl: getBaseUrl(PORT),
    brand: brandPayload(),
    customerUrl: getRelayConfig().url || '',
  };
}

function emitMenuUpdated() {
  io.emit('menu:updated', getMenu());
}

let syncRunning = null;
let syncRequested = false;
function maybeSyncMenu() {
  syncRequested = true;
  if (syncRunning) return syncRunning;
  syncRunning = (async () => {
    while (syncRequested) {
      syncRequested = false;
      const settings = getSettings();
      if (!settings.supabaseSync) continue;
      const deletedIds = getPendingMenuDeletions();
      const result = await syncMenuToSupabase(settings, getMenu(), deletedIds);
      setSetting('syncError', result.ok ? '' : result.reason);
      if (result.ok) {
        acknowledgeMenuDeletions(deletedIds);
        setSetting('lastSynced', new Date().toISOString());
      }
    }
  })().finally(() => { syncRunning = null; });
  return syncRunning;
}

// Retry durable cloud deletions after a restart or temporary outage.
setInterval(() => maybeSyncMenu().catch(() => {}), 30000).unref();
maybeSyncMenu().catch(() => {});

// ——— REST ———

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    name: getSettings().name,
    service: 'ezycaf-hub',
    networkMode: 'lan-only',
    lan: getLanIp(),
    port: PORT,
    baseUrl: getBaseUrl(PORT),
  });
});

const relayTick = startCustomerRelay(() => ({ tables: getTables(), brand: brandPayload(), menu: getMenu() }), (payload, id) => {
  const result = acceptOrder(payload, id);
  if (result.created) io.emit('order:new', result.order);
  return result;
});

app.post('/api/setup/customer-service', async (req, res) => {
  const remote = req.socket.remoteAddress?.replace(/^::ffff:/, '');
  if (remote !== '::1' && !remote?.startsWith('127.')) return res.status(403).json({ error: 'Pair the customer service on the host computer.' });
  const { url, token } = req.body || {};
  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'Enter the HTTPS customer service address.' }); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/' || typeof token !== 'string' || token.length < 32 || token.length > 512) return res.status(400).json({ error: 'Use an HTTPS origin and a pairing token of at least 32 characters.' });
  try {
    const check = await fetch(`${parsed.origin}/relay/health`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!check.ok || (await check.json()).service !== 'ezycaf-customer-relay') throw new Error('Pairing failed. Check the address and token.');
    setSetting('relayUrl', parsed.origin); setSetting('relayToken', token);
    await relayTick();
    io.emit('hub:hello', hubHello());
    res.json({ ok: true });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

app.delete('/api/setup/customer-service', (req, res) => {
  const remote = req.socket.remoteAddress?.replace(/^::ffff:/, '');
  if (remote !== '::1' && !remote?.startsWith('127.')) return res.status(403).json({ error: 'Unpair on the host computer.' });
  setSetting('relayUrl', ''); setSetting('relayToken', ''); io.emit('hub:hello', hubHello()); res.json({ ok: true });
});

app.get('/api/setup/deployment-bundle', (_req, res) => {
  const bundle = path.join(CLIENT_DIST, 'downloads', 'EzyCaf-customer-service.zip');
  if (!fs.existsSync(bundle)) return res.status(503).json({ error: 'Build the application to generate the deployment bundle.' });
  res.download(bundle);
});

app.get('/api/setup', (_req, res) => {
  res.json({ complete: getSettings().setupComplete, name: getSettings().name, tables: getTables(), baseUrl: getBaseUrl(PORT), networkMode: 'lan-only', customerService: { url: getRelayConfig().url, lastSeen: getRelayConfig().lastSeen, error: getRelayConfig().error } });
});

app.post('/api/setup', (req, res) => {
  // Only the host computer can configure first-run setup.
  const remote = req.socket.remoteAddress?.replace(/^::ffff:/, '');
  if (remote !== '::1' && !remote?.startsWith('127.')) return res.status(403).json({ error: 'Run setup on the cafe host computer.' });
  const { name, accent, tableCount } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.length > 80 || !/^#[0-9a-f]{6}$/i.test(accent || '') || !Number.isInteger(tableCount) || tableCount < 1 || tableCount > 100) {
    return res.status(400).json({ error: 'Enter a cafe name, colour and 1–100 tables.' });
  }
  completeSetup({ name: name.trim(), accent, tableCount });
  io.emit('hub:hello', hubHello());
  res.json({ ok: true, baseUrl: getBaseUrl(PORT), tables: getTables() });
});

app.get('/api/settings', (_req, res) => {
  res.json(getSettings());
});

app.put('/api/settings', (req, res) => {
  const body = req.body || {};
  if (typeof body.name === 'string') setSetting('name', body.name.slice(0, 80));
  if (typeof body.accent === 'string' && /^#[0-9A-Fa-f]{6}$/.test(body.accent)) {
    setSetting('accent', body.accent);
  }
  if (typeof body.supabaseUrl === 'string') setSetting('supabaseUrl', body.supabaseUrl.trim());
  if (typeof body.supabaseAnonKey === 'string') setSetting('supabaseAnonKey', body.supabaseAnonKey.trim());
  if (typeof body.supabaseSync === 'boolean') setSetting('supabaseSync', body.supabaseSync ? '1' : '0');

  const settings = getSettings();
  io.emit('hub:hello', hubHello());
  res.json(settings);

  // Fire-and-forget sync if just enabled
  maybeSyncMenu().catch(() => {});
});

app.post('/api/settings/logo', upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const logoUrl = `/uploads/${req.file.filename}`;
  setSetting('logoUrl', logoUrl);
  io.emit('hub:hello', hubHello());
  res.json({ logoUrl, ...getSettings() });
});

app.delete('/api/settings/logo', (_req, res) => {
  setSetting('logoUrl', '');
  io.emit('hub:hello', hubHello());
  res.json(getSettings());
});

app.get('/api/tables', (_req, res) => {
  res.json(getTables());
});

app.get('/api/menu', (_req, res) => {
  res.json(getMenu());
});

app.post('/api/menu', (req, res) => {
  const body = req.body || {};
  const id = body.id || `m_${crypto.randomBytes(4).toString('hex')}`;
  const item = upsertMenuItem({
    id,
    name: String(body.name || 'Item').slice(0, 120),
    description: String(body.description || '').slice(0, 400),
    price: Number(body.price) || 0,
    category: String(body.category || 'Mains').slice(0, 60),
    available: body.available !== false,
    sortOrder: Number(body.sortOrder) || 0,
  });
  emitMenuUpdated();
  maybeSyncMenu().catch(() => {});
  res.status(201).json(item);
});

app.put('/api/menu/:id', (req, res) => {
  const body = req.body || {};
  const item = upsertMenuItem({
    id: req.params.id,
    name: String(body.name || 'Item').slice(0, 120),
    description: String(body.description || '').slice(0, 400),
    price: Number(body.price) || 0,
    category: String(body.category || 'Mains').slice(0, 60),
    available: body.available !== false,
    sortOrder: Number(body.sortOrder) || 0,
  });
  emitMenuUpdated();
  maybeSyncMenu().catch(() => {});
  res.json(item);
});

app.delete('/api/menu/:id', (req, res) => {
  if (!deleteMenuItem(req.params.id)) return res.status(404).json({ error: 'Menu item not found' });
  emitMenuUpdated();
  maybeSyncMenu().catch(() => {});
  res.json({ ok: true, cloudSync: getSettings().supabaseSync ? 'pending' : 'off' });
});

app.get('/api/orders', (_req, res) => {
  res.json(getAllOrdersForCashier());
});

app.get('/api/orders/active', (_req, res) => {
  res.json(getActiveOrders());
});

app.get('/api/orders/table/:tableId', (req, res) => {
  res.json(getOrdersByTable(req.params.tableId));
});

app.get('/api/qr/:tableId', async (req, res) => {
  const tables = getTables();
  const table = tables.find((t) => t.id === req.params.tableId);
  if (!table) return res.status(404).json({ error: 'Table not found' });
  const url = `${getRelayConfig().url || getBaseUrl(PORT)}/t/${table.id}`;
  try {
    const svg = await QRCode.toString(url, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
      width: 256,
    });
    res.type('image/svg+xml').send(svg);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get('/api/hub', (_req, res) => {
  res.json(hubHello());
});

// ——— Socket.io ———

io.on('connection', (socket) => {
  socket.emit('hub:hello', hubHello());
  socket.emit('menu:updated', getMenu());
  socket.emit('order:updated', { type: 'snapshot', orders: getActiveOrders() });

  socket.on('order:create', (payload, ack) => {
    try {
      const requestId = /^q_[0-9a-f-]{36}$/.test(payload?.requestId || '') ? payload.requestId : undefined;
      const { order, created } = acceptOrder(payload, requestId);
      if (created) io.emit('order:new', order);
      if (typeof ack === 'function') ack({ ok: true, order });
    } catch (error) {
      if (typeof ack === 'function') ack({ ok: false, error: error.message });
    }
  });

  socket.on('order:status', (payload, ack) => {
    try {
      const { orderId, status } = payload || {};
      const allowed = ['pending', 'cooking', 'ready', 'paid'];
      if (!orderId || !allowed.includes(status)) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Invalid status' });
        return;
      }
      const order = updateOrderStatus(orderId, status);
      if (!order) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Not found' });
        return;
      }
      io.emit('order:updated', order);
      if (typeof ack === 'function') ack({ ok: true, order });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: String(err.message || err) });
    }
  });

  socket.on('table:clear', (payload, ack) => {
    try {
      const tableId = payload?.tableId;
      if (!tableId) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Missing tableId' });
        return;
      }
      clearTable(tableId);
      io.emit('table:cleared', { tableId });
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: String(err.message || err) });
    }
  });
});

// SPA static
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

httpServer.listen(PORT, '0.0.0.0', () => {
  const lan = getLanIp();
  console.log(`EzyCaf Hub listening on 0.0.0.0:${PORT}`);
  console.log(`  Local:  http://localhost:${PORT}`);
  console.log(`  LAN:    http://${lan}:${PORT}`);
});
