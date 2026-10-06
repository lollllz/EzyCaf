import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const folder = mkdtempSync(path.join(tmpdir(), 'ezycaf-bundle-'));
const token = 'deployment-test-token-only-00000000000000';
const name = `ezycaf-bundle-test-${process.pid}`;
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} failed`);
}
try {
  run('unzip', ['-q', 'client/dist/downloads/EzyCaf-customer-service.zip', '-d', folder]);
  run('docker', ['build', '-t', name, '-f', path.join(folder, 'relay/Dockerfile'), folder]);
  run('docker', ['run', '-d', '--name', name, '-e', `RELAY_TOKEN=${token}`, '-p', '127.0.0.1:3987:8080', name]);
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:3987/relay/health', { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(500) });
      ready = response.ok && (await response.json()).service === 'ezycaf-customer-relay';
      if (ready) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Deployment ZIP container did not start');
  if ((await fetch('http://127.0.0.1:3987/api/settings')).status !== 403) throw new Error('Public customer service exposed staff settings');
  if (!(await fetch('http://127.0.0.1:3987/t/table-test')).ok) throw new Error('Customer frontend was not served');
  console.log('Deployment ZIP builds and serves its customer frontend while denying staff settings');
} catch (error) {
  spawnSync('docker', ['logs', name], { stdio: 'inherit' });
  throw error;
} finally {
  spawnSync('docker', ['rm', '-f', name], { stdio: 'inherit' });
  rmSync(folder, { recursive: true, force: true });
}
