// Electron main process for Companion Web Dashboard.
//
// Behaviour:
//   - On launch, starts the bundled Node server as a child process in the
//     background. No window is auto-opened.
//   - Installs a menu-bar (tray) icon. Clicking it reveals a menu with
//     Open Editor, Open Viewer, Show Status, Settings, Quit.
//   - Status window is optional and shows server state (running / port / url).
//   - Editor and Viewer open in the user's default browser, not inside the app.
//   - App stays running even with no windows open; quit only via tray menu
//     or Cmd+Q.

const {
  app, BrowserWindow, shell, Menu, Tray, dialog, nativeImage, clipboard
} = require('electron');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');

const IS_DEV = !app.isPackaged;
const PRODUCT_NAME = 'Companion Web Dashboard';

// macOS: hide the Dock icon, this is a menu-bar app.
// (We leave this on for other platforms too — they'll just show in the
// task bar / system tray as normal.)
if (process.platform === 'darwin' && app.dock) {
  app.dock.hide();
}

// ---------- paths -------------------------------------------------------

function resolveServerPaths() {
  if (IS_DEV) {
    const repo = path.resolve(__dirname, '..');
    return {
      entry: path.join(repo, 'server', 'dist', 'index.js'),
      cwd: path.join(repo, 'server'),
      clientDist: path.join(repo, 'client', 'dist')
    };
  }
  const res = process.resourcesPath;
  return {
    entry: path.join(res, 'server', 'dist', 'index.js'),
    cwd: path.join(res, 'server'),
    clientDist: path.join(res, 'client', 'dist')
  };
}

// ---------- port + readiness -------------------------------------------

function pickPort(preferred) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => {
        const s = net.createServer().listen(0, '127.0.0.1', () => {
          const port = s.address().port;
          s.close(() => resolve(port));
        });
      })
      .once('listening', () => {
        tester.close(() => resolve(preferred));
      })
      .listen(preferred, '127.0.0.1');
  });
}

function waitForServer(port, timeoutMs = 15000) {
  const url = `http://127.0.0.1:${port}/api/health`;
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on('error', retry);
      req.setTimeout(800, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() > deadline) {
        return reject(new Error(`server did not become ready within ${timeoutMs}ms`));
      }
      setTimeout(tick, 300);
    };
    tick();
  });
}

// ---------- state -------------------------------------------------------

let serverProcess = null;
let serverPort = null;
let serverStatus = 'starting'; // 'starting' | 'running' | 'stopped' | 'error'
let serverError = null;
let tray = null;
let trayIconLoaded = false;
let statusWindow = null;

// ---------- server lifecycle -------------------------------------------

async function startServer() {
  const paths = resolveServerPaths();
  if (!fs.existsSync(paths.entry)) {
    serverStatus = 'error';
    serverError = `server entry not found at ${paths.entry}`;
    return;
  }

  try {
    serverPort = await pickPort(3000);
  } catch (e) {
    serverStatus = 'error';
    serverError = `port selection failed: ${e.message || e}`;
    return;
  }

  const env = {
    ...process.env,
    PORT: String(serverPort),
    ELECTRON_RUN_AS_NODE: '1'
  };

  serverProcess = spawn(process.execPath, [paths.entry], {
    cwd: paths.cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', (b) => process.stdout.write(`[server] ${b}`));
  serverProcess.stderr.on('data', (b) => process.stderr.write(`[server] ${b}`));
  serverProcess.on('exit', (code, sig) => {
    serverProcess = null;
    serverStatus = 'stopped';
    serverError = `server exited (code=${code}, signal=${sig})`;
    refreshTrayMenu();
    if (statusWindow && !statusWindow.isDestroyed()) statusWindow.webContents.send('status', getStatus());
  });

  try {
    await waitForServer(serverPort);
    serverStatus = 'running';
    serverError = null;
  } catch (e) {
    serverStatus = 'error';
    serverError = e.message || String(e);
  }
  refreshTrayMenu();
  if (statusWindow && !statusWindow.isDestroyed()) statusWindow.webContents.send('status', getStatus());
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.removeAllListeners('exit');
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
  serverStatus = 'stopped';
}

async function restartServer() {
  stopServer();
  serverStatus = 'starting';
  refreshTrayMenu();
  await startServer();
}

function getStatus() {
  return {
    status: serverStatus,
    port: serverPort,
    error: serverError,
    url: serverPort ? `http://127.0.0.1:${serverPort}/` : null
  };
}

// ---------- tray --------------------------------------------------------

function makeTrayIcon() {
  // Look for a template PNG. macOS template images are black + alpha;
  // the system auto-tints for light/dark menu bar.
  const iconPath = path.join(__dirname, 'build', 'trayTemplate.png');
  if (fs.existsSync(iconPath)) {
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) {
      img.setTemplateImage(true);
      trayIconLoaded = true;
      return img;
    }
  }
  trayIconLoaded = false;
  return nativeImage.createEmpty();
}

function refreshTrayMenu() {
  if (!tray) return;
  const s = getStatus();
  const statusLabel =
    s.status === 'running' ? `● Running on :${s.port}` :
    s.status === 'starting' ? '○ Starting…' :
    s.status === 'stopped' ? '○ Stopped' :
                              '⚠ Error';

  const items = [
    { label: PRODUCT_NAME, enabled: false },
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    {
      label: 'Open Editor in Browser',
      enabled: s.status === 'running',
      accelerator: 'CommandOrControl+E',
      click: () => { if (s.url) shell.openExternal(s.url); }
    },
    {
      label: 'Copy Server URL',
      enabled: s.status === 'running',
      click: () => { if (s.url) clipboard.writeText(s.url); }
    },
    { type: 'separator' },
    {
      label: 'Show Status Window',
      click: () => showStatusWindow()
    },
    {
      label: 'Restart Server',
      click: () => { void restartServer(); }
    },
    { type: 'separator' },
    {
      label: `Quit ${PRODUCT_NAME}`,
      accelerator: 'CommandOrControl+Q',
      click: () => {
        stopServer();
        app.quit();
      }
    }
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
  tray.setToolTip(
    s.status === 'running'
      ? `${PRODUCT_NAME} — running on port ${s.port}`
      : `${PRODUCT_NAME} — ${s.status}`
  );
  // macOS: show product name in the menu bar when no icon image is available.
  if (!trayIconLoaded) {
    tray.setTitle('CWD');
  }
}

function setupTray() {
  tray = new Tray(makeTrayIcon());
  tray.on('click', () => tray.popUpContextMenu());
  refreshTrayMenu();
}

// ---------- status window (Companion-style) -----------------------------

function showStatusWindow() {
  if (statusWindow && !statusWindow.isDestroyed()) {
    statusWindow.show();
    statusWindow.focus();
    return;
  }
  statusWindow = new BrowserWindow({
    width: 480,
    height: 360,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: PRODUCT_NAME,
    backgroundColor: '#0a0a0a',
    show: false,
    skipTaskbar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  // Inline status HTML — no separate file needed.
  const html = String.raw`<!doctype html>
<html><head><meta charset="utf-8"><title>${PRODUCT_NAME}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    font: 14px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
    background: #0a0a0a; color: #eaeaea;
    -webkit-font-smoothing: antialiased;
  }
  h1 { margin: 0 0 4px; font-size: 18px; }
  .sub { color: #888; margin-bottom: 24px; }
  .status {
    border-radius: 8px; padding: 16px;
    background: #141414; border: 1px solid #2a2a2a;
    margin-bottom: 16px;
  }
  .status .label { color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  .status .value { font-size: 20px; font-weight: 600; margin-top: 4px; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; vertical-align: middle; background: #555; }
  .dot.on { background: #22c55e; }
  .dot.warn { background: #f59e0b; }
  .dot.err { background: #ef4444; }
  .url-row {
    display: flex; gap: 8px; align-items: center;
    background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 6px;
    padding: 8px 12px; margin-bottom: 8px; font-family: ui-monospace, Menlo, monospace;
  }
  .url-row .url { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button {
    background: #2563eb; color: #fff; border: none; padding: 8px 14px;
    border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;
  }
  button:hover { background: #1d4ed8; }
  button.secondary { background: #2a2a2a; }
  button.secondary:hover { background: #353535; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .err { color: #ef4444; font-size: 12px; margin-top: 8px; }
</style></head>
<body>
  <h1>${PRODUCT_NAME}</h1>
  <div class="sub">Local web server for Bitfocus Companion variables</div>

  <div class="status">
    <div class="label">Status</div>
    <div class="value"><span class="dot" id="dot"></span><span id="statusText">…</span></div>
    <div class="err" id="errText"></div>
  </div>

  <div class="status">
    <div class="label">Editor URL</div>
    <div class="url-row">
      <span class="url" id="urlText">—</span>
      <button class="secondary" id="copyBtn">Copy</button>
    </div>
    <div class="actions">
      <button id="openBtn">Open in browser</button>
      <button class="secondary" id="restartBtn">Restart server</button>
    </div>
  </div>

  <script>
    const dot = document.getElementById('dot');
    const st = document.getElementById('statusText');
    const er = document.getElementById('errText');
    const ut = document.getElementById('urlText');
    function render(s) {
      st.textContent =
        s.status === 'running' ? 'Running' :
        s.status === 'starting' ? 'Starting…' :
        s.status === 'stopped' ? 'Stopped' : 'Error';
      dot.className = 'dot ' + (s.status === 'running' ? 'on' : s.status === 'error' ? 'err' : 'warn');
      er.textContent = s.error || '';
      ut.textContent = s.url || '—';
    }
    document.getElementById('openBtn').onclick = () => window.cwd.open();
    document.getElementById('copyBtn').onclick = () => window.cwd.copy();
    document.getElementById('restartBtn').onclick = () => window.cwd.restart();
    window.cwd.onStatus(render);
    window.cwd.getStatus().then(render);
  </script>
</body></html>`;

  statusWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  statusWindow.once('ready-to-show', () => statusWindow.show());
  statusWindow.on('closed', () => { statusWindow = null; });
}

// ---------- IPC for status window --------------------------------------

const { ipcMain } = require('electron');
ipcMain.handle('cwd:getStatus', () => getStatus());
ipcMain.on('cwd:open', () => {
  if (serverPort) shell.openExternal(`http://127.0.0.1:${serverPort}/`);
});
ipcMain.on('cwd:copy', () => {
  if (serverPort) clipboard.writeText(`http://127.0.0.1:${serverPort}/`);
});
ipcMain.on('cwd:restart', () => { void restartServer(); });

// ---------- boot --------------------------------------------------------

app.whenReady().then(async () => {
  try {
    setupTray();
  } catch (e) {
    console.error('[tray] setup failed:', e);
  }
  try {
    await startServer();
  } catch (e) {
    console.error('[server] start failed:', e);
    serverStatus = 'error';
    serverError = String(e && e.message || e);
    refreshTrayMenu();
  }
  // After server is up, briefly flash the status window on first launch so
  // the user knows where to find the app.
  showStatusWindow();
}).catch(e => {
  console.error('[boot] fatal:', e);
});

app.on('window-all-closed', (e) => {
  // Don't quit when the status window closes — we live in the menu bar.
  e.preventDefault?.();
});

app.on('before-quit', stopServer);
process.on('exit', stopServer);
process.on('SIGINT', () => { stopServer(); process.exit(0); });
process.on('SIGTERM', () => { stopServer(); process.exit(0); });
