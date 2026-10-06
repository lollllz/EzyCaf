import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCafeNetwork, allowedRequest } from '../src/network-access.js';
const interfaces = { en0: [{ family: 'IPv4', internal: false, address: '192.168.40.2', netmask: '255.255.255.0' }] };
test('LAN access is restricted to the actual cafe subnet, without VPN interfaces', () => {
  assert.equal(isCafeNetwork('::ffff:192.168.40.9', interfaces), true);
  assert.equal(isCafeNetwork('192.168.41.9', interfaces), false);
  assert.equal(isCafeNetwork('10.8.0.3', { utun2: [{ family: 'IPv4', internal: false, address: '10.8.0.2', netmask: '255.255.255.0' }] }), false);
  assert.equal(isCafeNetwork('8.8.8.8', interfaces), false);
  assert.equal(isCafeNetwork('127.0.0.1', interfaces), true);
  assert.equal(isCafeNetwork('192.168.40.999', interfaces), false);
});
test('cross-origin browser calls are denied even from localhost', () => {
  const req = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost:3847', origin: 'https://untrusted.example' } };
  assert.equal(allowedRequest(req), false);
  req.headers.origin = 'http://localhost:3847'; assert.equal(allowedRequest(req), true);
  req.headers.host = 'attacker.example'; req.headers.origin = 'http://attacker.example'; assert.equal(allowedRequest(req), false);
});
