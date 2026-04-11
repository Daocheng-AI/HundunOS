/**
 * hundunos-client/gui/preload.js
 * Preload script — 安全桥接 renderer 和 main
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hundunos', {
  process: (msg) => ipcRenderer.invoke('process', msg),
  getStatus: () => ipcRenderer.invoke('getStatus'),
  getHealth: () => ipcRenderer.invoke('getHealth'),
  getModules: () => ipcRenderer.invoke('getModules'),
  onNavigate: (cb) => ipcRenderer.on('navigate', (_, view) => cb(view)),
  onKernelRestart: (cb) => ipcRenderer.on('kernel:restart', () => cb()),
});
