const path = require('node:path');
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen
} = require('electron');

let overlayWindow = null;
let operationMode = false;

const isSmoke = process.argv.includes('--smoke');

function getVirtualDisplayBounds() {
  const displays = screen.getAllDisplays();
  const left = Math.min(...displays.map((display) => display.bounds.x));
  const top = Math.min(...displays.map((display) => display.bounds.y));
  const right = Math.max(
    ...displays.map((display) => display.bounds.x + display.bounds.width)
  );
  const bottom = Math.max(
    ...displays.map((display) => display.bounds.y + display.bounds.height)
  );

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

function getWindowBounds() {
  if (isSmoke) {
    return { x: 80, y: 80, width: 1280, height: 720 };
  }

  return getVirtualDisplayBounds();
}

function applyOverlayBounds() {
  if (!overlayWindow || overlayWindow.isDestroyed() || isSmoke) {
    return;
  }

  overlayWindow.setBounds(getWindowBounds());
}

function sendOperationMode(source) {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }

  overlayWindow.webContents.send('focus-veil:operation-mode', {
    enabled: operationMode,
    source
  });
}

function setOperationMode(enabled, source = 'main') {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    operationMode = enabled;
    return;
  }

  operationMode = enabled;

  if (enabled) {
    overlayWindow.setFocusable(true);
    overlayWindow.setIgnoreMouseEvents(false);
    overlayWindow.show();
    overlayWindow.focus();
  } else {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.setFocusable(false);
    overlayWindow.blur();
    overlayWindow.showInactive();
  }

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  sendOperationMode(source);
}

function registerShortcuts() {
  const toggleRegistered = globalShortcut.register('CommandOrControl+Shift+F', () => {
    setOperationMode(!operationMode, 'shortcut');
  });

  if (!toggleRegistered) {
    console.warn('Focus Veil: failed to register CommandOrControl+Shift+F.');
  }
}

function createWindow() {
  const bounds = getWindowBounds();

  overlayWindow = new BrowserWindow({
    ...bounds,
    title: 'Focus Veil',
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  overlayWindow.setMenuBarVisibility(false);
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'), {
    query: {
      smoke: isSmoke ? '1' : '0'
    }
  });

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.showInactive();
    sendOperationMode('ready');
  });

  overlayWindow.webContents.once('did-finish-load', () => {
    console.log('FOCUS_VEIL_READY');
  });
}

ipcMain.handle('focus-veil:set-operation-mode', (_event, enabled) => {
  setOperationMode(Boolean(enabled), 'renderer');
  return { enabled: operationMode };
});

ipcMain.handle('focus-veil:get-main-state', () => ({
  operationMode,
  smoke: isSmoke
}));

app.whenReady().then(() => {
  createWindow();
  registerShortcuts();

  screen.on('display-added', applyOverlayBounds);
  screen.on('display-removed', applyOverlayBounds);
  screen.on('display-metrics-changed', applyOverlayBounds);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
