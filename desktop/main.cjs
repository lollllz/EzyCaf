const { app, BrowserWindow, dialog, utilityProcess } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
let hub;
let window;
const port = 3847;
const origin = `http://127.0.0.1:${port}`;
if (process.env.EZYCAF_APP_DATA_DIR) { fs.mkdirSync(process.env.EZYCAF_APP_DATA_DIR, { recursive: true }); app.setPath('userData', process.env.EZYCAF_APP_DATA_DIR); }

async function available() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(port, '0.0.0.0', () => probe.close(resolve));
  });
}

async function start() {
  await available();
  const data = path.join(app.getPath('userData'), 'hub-data');
  fs.mkdirSync(data, { recursive: true });
  const logs = fs.createWriteStream(path.join(data, 'hub.log'), { flags: 'a' });
  hub = utilityProcess.fork(path.join(app.getAppPath(), 'server', 'src', 'index.js'), [], {
    cwd: app.isPackaged ? process.resourcesPath : app.getAppPath(),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production', EZYCAF_DATA_DIR: data, EZYCAF_UPLOAD_DIR: path.join(data, 'uploads') },
    stdio: 'pipe', serviceName: 'EzyCaf cafe hub',
  });
  hub.stdout.on('data', (chunk) => logs.write(chunk));
  hub.stderr.on('data', (chunk) => logs.write(chunk));
  let exited = false;
  hub.on('exit', () => { exited = true; logs.end(); if (window && !app.isQuitting) dialog.showErrorBox('Cafe hub stopped', `Restart EzyCaf. Details are in ${data}/hub.log.`); });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (exited) throw new Error(`The cafe hub could not start. See ${data}/hub.log.`);
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok && (await response.json()).service === 'ezycaf-hub') { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error(`The cafe hub did not become ready. See ${data}/hub.log.`);
  window = new BrowserWindow({ width: 1200, height: 850, minWidth: 360, minHeight: 600, title: 'EzyCaf', backgroundColor: '#F7F5EF', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  const setup = await (await fetch(`${origin}/api/setup`)).json();
  await window.loadURL(`${origin}${setup.complete ? '/' : '/setup'}`);
  if (process.env.EZYCAF_SMOKE_TEST === '1') setTimeout(() => app.quit(), 5000);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(start).catch((error) => { dialog.showErrorBox('EzyCaf could not start', error.code === 'EADDRINUSE' ? 'Port 3847 is already in use. Close the other cafe hub before starting EzyCaf.' : error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { app.isQuitting = true; hub?.kill(); });
}
