import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
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
  createOrder,
  updateOrderStatus,
  getActiveOrders,
  getOrdersByTable,
  clearTable,
  getAllOrdersForCashier,
  getOrder,
} from './db.js';
import { getLanIp, getBaseUrl } from './lan.js';
import { syncMenuToSupabase } from './supabase-sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const UPLOADS = path.join(ROOT, 'uploads');
const CLIENT_DIST = path.join(ROOT, 'client', 'dist');
const PORT = Number(process.env.PORT) || 3847;

if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

initDb();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

app.use(cors());
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
  };
}

function emitMenuUpdated() {
  io.emit('menu:updated', getMenu());
}

async function maybeSyncMenu() {
  const settings = getSettings();
  if (!settings.supabaseSync) return;
  const result = await syncMenuToSupabase(settings, getMenu());
  if (result.ok) {
    const ts = new Date().toISOString();
    setSetting('lastSynced', ts);
    io.emit('hub:hello', hubHello());
  }
  // Never throw — LAN must keep working
}

// ——— REST ———

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'Kamil',
    lan: getLanIp(),
    port: PORT,
    baseUrl: getBaseUrl(PORT),
  });
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
  deleteMenuItem(req.params.id);
  emitMenuUpdated();
  maybeSyncMenu().catch(() => {});
  res.json({ ok: true });
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
  const url = `${getBaseUrl(PORT)}/t/${table.id}`;
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
      const tableId = payload?.tableId;
      const items = Array.isArray(payload?.items) ? payload.items : [];
      if (!tableId || items.length === 0) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Invalid order' });
        return;
      }
      const table = getTables().find((t) => t.id === tableId);
      if (!table) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Unknown table' });
        return;
      }
      const menu = getMenu();
      const normalized = items
        .map((it) => {
          const m = menu.find((x) => x.id === it.id);
          if (!m || !m.available) return null;
          const qty = Math.max(1, Math.min(99, Number(it.qty) || 1));
          return {
            id: m.id,
            name: m.name,
            price: m.price,
            qty,
            lineTotal: Math.round(m.price * qty * 100) / 100,
          };
        })
        .filter(Boolean);
      if (normalized.length === 0) {
        if (typeof ack === 'function') ack({ ok: false, error: 'No valid items' });
        return;
      }
      const total = Math.round(normalized.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
      const order = createOrder({
        id: `o_${crypto.randomBytes(5).toString('hex')}`,
        tableId,
        items: normalized,
        total,
        note: String(payload?.note || '').slice(0, 200),
      });
      io.emit('order:new', order);
      if (typeof ack === 'function') ack({ ok: true, order });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: String(err.message || err) });
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
  console.log(`Kamil Hub listening on 0.0.0.0:${PORT}`);
  console.log(`  Local:  http://localhost:${PORT}`);
  console.log(`  LAN:    http://${lan}:${PORT}`);
});
