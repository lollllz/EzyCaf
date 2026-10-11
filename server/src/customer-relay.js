import { getRelayConfig, setSetting } from './db.js';

export function startCustomerRelay(snapshot, accept) {
  let running = false;
  async function tick() {
    if (running) return;
    const config = getRelayConfig();
    if (!config.url || !config.token) return;
    running = true;
    try {
      const headers = { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' };
      const current = snapshot();
      const { receipts = [], ...publicSnapshot } = current;
      const update = await fetch(`${config.url}/relay/snapshot`, { method: 'POST', headers, body: JSON.stringify(publicSnapshot), signal: AbortSignal.timeout(8000) });
      if (!update.ok) throw new Error(`relay_http_${update.status}`);
      let batch = []; let bytes = 20;
      async function sendReceipts() {
        if (!batch.length) return;
        const sent = await fetch(`${config.url}/relay/receipts`, { method: 'POST', headers, body: JSON.stringify({ receipts: batch }), signal: AbortSignal.timeout(8000) });
        if (!sent.ok) throw new Error(`relay_receipts_${sent.status}`);
        batch = []; bytes = 20;
      }
      for (const receipt of receipts) {
        const size = Buffer.byteLength(JSON.stringify(receipt)) + 1;
        if (bytes + size > 200000) await sendReceipts();
        batch.push(receipt); bytes += size;
      }
      await sendReceipts();
      const response = await fetch(`${config.url}/relay/orders`, { headers, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`relay_http_${response.status}`);
      for (const request of await response.json()) {
        let result;
        try { const { order } = accept(request.payload, request.id); result = { ok: true, orderId: order.id, order }; }
        catch (error) { result = { ok: false, error: error.message }; }
        const ack = await fetch(`${config.url}/relay/orders/${encodeURIComponent(request.id)}`, { method: 'POST', headers, body: JSON.stringify(result), signal: AbortSignal.timeout(8000) });
        if (!ack.ok) throw new Error(`relay_ack_${ack.status}`);
      }
      setSetting('relayError', '');
      setSetting('relayLastSeen', new Date().toISOString());
    } catch (error) { setSetting('relayError', error.message); }
    finally { running = false; }
  }
  const timer = setInterval(tick, 2000);
  timer.unref();
  tick();
  return tick;
}
