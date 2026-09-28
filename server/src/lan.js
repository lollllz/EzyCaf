import os from 'os';

export function getLanIp() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push({ name, address: iface.address });
      }
    }
  }
  // Prefer common LAN ranges
  const preferred = candidates.find((c) =>
    /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(c.address)
  );
  return (preferred || candidates[0])?.address || '127.0.0.1';
}

export function getBaseUrl(port) {
  return `http://${getLanIp()}:${port}`;
}
