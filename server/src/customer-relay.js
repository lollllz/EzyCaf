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
      const update = await fetch(`${config.url}/relay/snapshot`, { method: 'POST', headers, body: JSON.stringify(snapshot()), signal: AbortSignal.timeout(8000) });
      if (!update.ok) throw new Error(`relay_http_${update.status}`);
      const response = await fetch(`${config.url}/relay/orders`, { headers, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`relay_http_${response.status}`);
      for (const request of await response.json()) {
        let result;
        try { const { order } = accept(request.payload, request.id); result = { ok: true, orderId: order.id }; }
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
