// Preload for the status window. Exposes a minimal, safe API to the page.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cwd', {
  getStatus: () => ipcRenderer.invoke('cwd:getStatus'),
  onStatus: (cb) => ipcRenderer.on('status', (_e, s) => cb(s)),
  open: () => ipcRenderer.send('cwd:open'),
  copy: () => ipcRenderer.send('cwd:copy'),
  restart: () => ipcRenderer.send('cwd:restart')
});
