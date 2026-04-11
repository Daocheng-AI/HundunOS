/**
 * hundunos-client/gui/main.js
 * Electron 主进程
 */
import { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
if (!app.requestSingleInstanceLock()) app.quit();

let mainWindow = null, tray = null, isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 750, minWidth: 800, minHeight: 600,
    title: 'HundunOS v3.0', backgroundColor: '#0d1117', show: false,
    webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  const idx = join(__dirname, 'renderer', 'index.html');
  existsSync(idx) ? mainWindow.loadFile(idx) : mainWindow.loadURL('http://127.0.0.1:38082');
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', e => { if (!isQuitting) { e.preventDefault(); mainWindow.hide(); } });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'HundunOS', submenu: [
      { label: 'Restart Kernel', click: () => mainWindow?.webContents.send('kernel:restart') },
      { type: 'separator' },
      { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
    ]},
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' }] },
    { label: 'Help', submenu: [{ label: 'Documentation', click: () => shell.openExternal('https://github.com/your-org/hundunos') }] },
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('HundunOS v3.0');
  tray.on('double-click', () => mainWindow?.show());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindow?.show() },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]));
}

app.on('second-instance', () => mainWindow?.show());
app.whenReady().then(() => { createWindow(); createTray(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });

ipcMain.handle('process', async (_, message) => {
  const res = await fetch('http://127.0.0.1:38080/api/process', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message),
  }).catch(() => null);
  return res?.json() || { error: 'Kernel unreachable' };
});
ipcMain.handle('getStatus', async () => {
  const res = await fetch('http://127.0.0.1:38080/api/status').catch(() => null);
  return res?.json() || {};
});
ipcMain.handle('getHealth', async () => {
  const res = await fetch('http://127.0.0.1:38080/api/health').catch(() => null);
  return res?.json() || {};
});
ipcMain.handle('getModules', async () => {
  const res = await fetch('http://127.0.0.1:38080/api/modules').catch(() => null);
  return res?.json() || {};
});
