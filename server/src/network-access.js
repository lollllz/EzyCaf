import os from 'os';

export function ipv4Number(ip) {
  const parts = ip?.split('.');
  if (parts?.length !== 4 || parts.some((s) => !/^\d{1,3}$/.test(s) || Number(s) > 255)) return null;
  return parts.reduce((n, s) => (n * 256 + Number(s)) >>> 0, 0);
}

export function isPrivateIpv4(ip) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) && ipv4Number(ip) !== null;
}

export function isCafeNetwork(address, interfaces = os.networkInterfaces()) {
  const ip = address?.replace(/^::ffff:/, '');
  if (ip === '::1' || /^127\./.test(ip || '')) return true;
  if (!isPrivateIpv4(ip || '')) return false;
  const remote = ipv4Number(ip);
  return Object.entries(interfaces).some(([name, list]) => {
    // A VPN interface is not a cafe LAN. Do not accept connections via it.
    if (/^(utun|tun|tap|wg|tailscale|zt|ppp)/i.test(name)) return false;
    return (list || []).some((iface) => {
      if (iface.family !== 'IPv4' || iface.internal || !isPrivateIpv4(iface.address)) return false;
      const mask = ipv4Number(iface.netmask);
      return mask !== null && mask !== 0 && (remote & mask) === (ipv4Number(iface.address) & mask);
    });
  });
}

export function allowedRequest(req) {
  if (!isCafeNetwork(req.socket.remoteAddress)) return false;
  // Reject arbitrary Host names to prevent DNS rebinding into the local hub.
  let host;
  try { host = new URL(`http://${req.headers.host}`).hostname; } catch { return false; }
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  for (const list of Object.values(os.networkInterfaces())) for (const iface of list || []) localHosts.add(iface.address);
  if (!localHosts.has(host)) return false;
  // Same-origin browser requests only. Native health probes have no Origin.
  if (!req.headers.origin) return true;
  try {
    return new URL(req.headers.origin).host === req.headers.host;
  } catch {
    return false;
  }
}
