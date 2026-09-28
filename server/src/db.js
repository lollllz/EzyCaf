import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'kamil.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL,
      category TEXT NOT NULL DEFAULT 'Mains',
      available INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      items_json TEXT NOT NULL,
      total REAL NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (table_id) REFERENCES tables(id)
    );
  `);

  const countSettings = db.prepare('SELECT COUNT(*) AS c FROM settings').get().c;
  if (countSettings === 0) {
    const set = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    set.run('name', 'Kamil');
    set.run('accent', '#0F766E');
    set.run('logoUrl', '');
    set.run('supabaseUrl', '');
    set.run('supabaseAnonKey', '');
    set.run('supabaseSync', '0');
    set.run('lastSynced', '');
  }

  const countTables = db.prepare('SELECT COUNT(*) AS c FROM tables').get().c;
  if (countTables === 0) {
    const insert = db.prepare('INSERT INTO tables (id, label, sort_order) VALUES (?, ?, ?)');
    [
      ['t1', 'Table 1', 1],
      ['t2', 'Table 2', 2],
      ['t3', 'Table 3', 3],
      ['t4', 'Table 4', 4],
    ].forEach(([id, label, order]) => insert.run(id, label, order));
  }

  const countMenu = db.prepare('SELECT COUNT(*) AS c FROM menu_items').get().c;
  if (countMenu === 0) {
    const insert = db.prepare(
      'INSERT INTO menu_items (id, name, description, price, category, available, sort_order) VALUES (?, ?, ?, ?, ?, 1, ?)'
    );
    const demo = [
      ['m1', 'Nasi Lemak', 'Coconut rice, sambal, egg, peanuts, anchovies', 12.5, 'Mains', 1],
      ['m2', 'Chicken Rice', 'Hainanese chicken, fragrant rice, soup', 11.0, 'Mains', 2],
      ['m3', 'Mee Goreng', 'Spicy fried noodles with prawns', 13.0, 'Mains', 3],
      ['m4', 'Satay Skewers', '6 skewers with peanut sauce', 10.0, 'Starters', 4],
      ['m5', 'Roti Canai', 'Flaky flatbread with curry', 4.5, 'Starters', 5],
      ['m6', 'Teh Tarik', 'Pulled milk tea', 3.5, 'Drinks', 6],
      ['m7', 'Fresh Lime Juice', 'Iced lime with mint', 4.0, 'Drinks', 7],
      ['m8', 'Cendol', 'Shaved ice, coconut milk, palm sugar', 6.5, 'Desserts', 8],
    ];
    demo.forEach((row) => insert.run(...row));
  }

  return db;
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    name: s.name || 'Kamil',
    accent: s.accent || '#0F766E',
    logoUrl: s.logoUrl || '',
    supabaseUrl: s.supabaseUrl || '',
    supabaseAnonKey: s.supabaseAnonKey || '',
    supabaseSync: s.supabaseSync === '1',
    lastSynced: s.lastSynced || '',
  };
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

export function getTables() {
  return db.prepare('SELECT id, label, sort_order AS sortOrder FROM tables ORDER BY sort_order').all();
}

export function getMenu() {
  return db
    .prepare(
      'SELECT id, name, description, price, category, available, sort_order AS sortOrder FROM menu_items ORDER BY sort_order, name'
    )
    .all()
    .map((r) => ({ ...r, available: !!r.available }));
}

export function upsertMenuItem(item) {
  const existing = db.prepare('SELECT id FROM menu_items WHERE id = ?').get(item.id);
  if (existing) {
    db.prepare(
      `UPDATE menu_items SET name=?, description=?, price=?, category=?, available=?, sort_order=? WHERE id=?`
    ).run(
      item.name,
      item.description || '',
      item.price,
      item.category || 'Mains',
      item.available ? 1 : 0,
      item.sortOrder ?? 0,
      item.id
    );
  } else {
    db.prepare(
      `INSERT INTO menu_items (id, name, description, price, category, available, sort_order) VALUES (?,?,?,?,?,?,?)`
    ).run(
      item.id,
      item.name,
      item.description || '',
      item.price,
      item.category || 'Mains',
      item.available ? 1 : 0,
      item.sortOrder ?? 0
    );
  }
  return getMenu().find((m) => m.id === item.id);
}

export function deleteMenuItem(id) {
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);
}

export function createOrder({ id, tableId, items, total, note }) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO orders (id, table_id, status, items_json, total, note, created_at, updated_at)
     VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)`
  ).run(id, tableId, JSON.stringify(items), total, note || '', now, now);
  return getOrder(id);
}

export function getOrder(id) {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!row) return null;
  return mapOrder(row);
}

export function updateOrderStatus(id, status) {
  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
  return getOrder(id);
}

export function getActiveOrders() {
  return db
    .prepare(
      `SELECT * FROM orders WHERE status IN ('pending','cooking','ready') ORDER BY created_at ASC`
    )
    .all()
    .map(mapOrder);
}

export function getOrdersByTable(tableId) {
  return db
    .prepare(
      `SELECT * FROM orders WHERE table_id = ? AND status IN ('pending','cooking','ready') ORDER BY created_at ASC`
    )
    .all()
    .map(mapOrder);
}

export function clearTable(tableId) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE orders SET status = 'paid', updated_at = ? WHERE table_id = ? AND status IN ('pending','cooking','ready')`
  ).run(now, tableId);
}

export function getAllOrdersForCashier() {
  return db
    .prepare(
      `SELECT * FROM orders WHERE status IN ('pending','cooking','ready') ORDER BY table_id, created_at`
    )
    .all()
    .map(mapOrder);
}

function mapOrder(row) {
  return {
    id: row.id,
    tableId: row.table_id,
    status: row.status,
    items: JSON.parse(row.items_json),
    total: row.total,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default db;
