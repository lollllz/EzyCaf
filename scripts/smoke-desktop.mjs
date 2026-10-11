import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const candidates = process.platform === 'darwin'
  ? ['release/mac-arm64/EzyCaf.app/Contents/MacOS/EzyCaf', 'release/mac/EzyCaf.app/Contents/MacOS/EzyCaf']
  : process.platform === 'win32' ? ['release/win-unpacked/EzyCaf.exe'] : ['release/linux-unpacked/ezycaf'];
const executable = candidates.map((file) => path.resolve(file)).find(existsSync);
if (!executable) throw new Error('Packaged desktop executable was not found');
const data = mkdtempSync(path.join(tmpdir(), 'ezycaf-package-test-'));
const command = process.platform === 'linux' ? 'xvfb-run' : executable;
const args = process.platform === 'linux' ? ['-a', executable, '--no-sandbox'] : [];
const child = spawn(command, args, { env: { ...process.env, EZYCAF_APP_DATA_DIR: data, EZYCAF_SMOKE_TEST: '1' }, stdio: 'inherit' });
let launchError;
child.on('error', (error) => { launchError = error; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (launchError) throw launchError;
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Packaged application exited before its hub was ready');
    try {
      const response = await fetch('http://127.0.0.1:3847/api/health', { signal: AbortSignal.timeout(300) });
      ready = response.ok && (await response.json()).service === 'ezycaf-hub';
      if (ready) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error('Packaged application did not start its cafe hub');
  if ((await fetch('http://127.0.0.1:3847/api/settings')).status !== 401) throw new Error('Packaged hub exposed staff settings');
  const code = readFileSync(path.join(data, 'hub-data', 'staff-access.txt'), 'utf8').trim();
  const login = await fetch('http://127.0.0.1:3847/api/staff/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  if (!login.ok) throw new Error('Packaged staff sign-in failed');
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const setup = await (await fetch('http://127.0.0.1:3847/api/setup', { headers: { Cookie: cookie } })).json();
  if (setup.complete !== false) throw new Error('A fresh installation should open guided setup');
  const page = await fetch('http://127.0.0.1:3847/setup');
  if (!page.ok || !(await page.text()).includes('<html')) throw new Error('Packaged frontend was not served');
  await new Promise((resolve) => setTimeout(resolve, 2000));
  if (child.exitCode !== null || child.signalCode !== null) throw new Error('Packaged application stopped unexpectedly');
  console.log('Packaged application started its SQLite hub and served guided setup');
} catch (error) {
  const log = path.join(data, 'hub-data', 'hub.log');
  if (existsSync(log)) console.error(readFileSync(log, 'utf8'));
  throw error;
} finally {
  for (let attempt = 0; attempt < 30 && child.exitCode === null && child.signalCode === null; attempt++) await new Promise((resolve) => setTimeout(resolve, 300));
  if (child.exitCode === null && child.signalCode === null) child.kill();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  rmSync(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
