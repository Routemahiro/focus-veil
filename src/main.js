const path = require('node:path');
const { app, BrowserWindow } = require('electron');

let overlayWindow = null;

function createWindow() {
  overlayWindow = new BrowserWindow({
    width: 960,
    height: 540,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  overlayWindow.once('ready-to-show', () => {
    overlayWindow.show();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
