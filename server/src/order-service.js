import crypto from 'node:crypto';
import { getMenu, getTables, getOrder, createOrder, matchesOrderReceipt } from './db.js';

export function acceptOrder(payload, id = `o_${crypto.randomBytes(8).toString('hex')}`) {
  if (!/^[0-9a-f]{64}$/.test(payload?.receiptToken || '')) throw new Error('Invalid order receipt');
  const prior = getOrder(id);
  if (prior) {
    if (!matchesOrderReceipt(id, payload.receiptToken)) throw new Error('Invalid order receipt');
    return { order: prior, created: false };
  }
  if (payload.receiptToken && !/^[0-9a-f]{64}$/.test(payload.receiptToken)) throw new Error('Invalid order receipt');
  if (!getTables().some((t) => t.id === payload?.tableId)) throw new Error('Unknown table');
  if (!Array.isArray(payload.items) || !payload.items.length || payload.items.length > 100) throw new Error('Invalid order');
  const menu = getMenu();
  const seen = new Set();
  const items = payload.items.map((item) => {
    const m = menu.find((row) => row.id === item.id && row.available);
    if (!m || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99 || seen.has(item.id)) throw new Error('An item is unavailable or its quantity is invalid. Review your cart.');
    seen.add(item.id);
    return { id: m.id, name: m.name, price: m.price, qty: item.qty, lineTotal: Math.round(m.price * item.qty * 100) / 100 };
  });
  const total = Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
  return { order: createOrder({ id, tableId: payload.tableId, items, total, receiptToken: payload.receiptToken, note: String(payload.note || '').slice(0, 200) }), created: true };
}
