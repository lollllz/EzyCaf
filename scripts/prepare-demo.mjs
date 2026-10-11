import path from 'node:path';
// This helper is intentionally restricted to the launcher's disposable demo store.
if (path.resolve(process.env.EZYCAF_DATA_DIR || '') !== path.resolve('.demo/data')) throw new Error('Demo setup requires the separate .demo/data database');
const { default: db, initDb, setSetting, completeSetup, updateOrderStatus } = await import('../server/src/db.js');
const { acceptOrder } = await import('../server/src/order-service.js');
initDb();
db.transaction(() => {
  const initialized = db.prepare("SELECT value FROM settings WHERE key='demoInitialized'").get();
  if (!initialized) {
    completeSetup({ name: 'EzyCaf · Demo', accent: '#215C47', tableCount: 4 });
    acceptOrder({ tableId: 't1', items: [{ id: 'm1', qty: 2 }, { id: 'm6', qty: 2 }], note: 'Demo: less spicy, please' }, 'demo-order-1');
    acceptOrder({ tableId: 't2', items: [{ id: 'm2', qty: 1 }], note: 'Demo order' }, 'demo-order-2');
    updateOrderStatus('demo-order-2', 'cooking');
    acceptOrder({ tableId: 't3', items: [{ id: 'm5', qty: 2 }], note: 'Demo order' }, 'demo-order-3');
    updateOrderStatus('demo-order-3', 'ready');
    setSetting('demoInitialized', '1');
  }
  // Do not send demo data to any previously configured remote service.
  setSetting('supabaseSync', '0');
  setSetting('supabaseUrl', '');
  setSetting('supabaseAnonKey', '');
  setSetting('relayUrl', '');
  setSetting('relayToken', '');
})();
db.close();
console.log('Demo ready. Fresh demos include four tables, a sample menu and three orders; previous demo changes are preserved.');
