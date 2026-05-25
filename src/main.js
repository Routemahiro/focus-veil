const path = require('node:path');
const fs = require('node:fs/promises');
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen
} = require('electron');

let overlayWindow = null;
let operationMode = false;
let smokeStarted = false;
let rendererLoaded = false;
let windowShown = false;

const isSmoke = process.argv.includes('--smoke');
const smokeOutputDirectory = path.join(__dirname, '..', 'artifacts');

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

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function analyzeImage(image, pngLength) {
  const size = image.getSize();
  const bitmap = image.toBitmap();
  const stride = 4;
  const pixelCount = Math.max(1, bitmap.length / stride);
  const sampleEvery = Math.max(1, Math.floor(pixelCount / 12000));
  let samples = 0;
  let alphaTotal = 0;
  let luminanceTotal = 0;
  let minLuminance = 255;
  let maxLuminance = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += sampleEvery) {
    const offset = pixel * stride;
    const blue = bitmap[offset];
    const green = bitmap[offset + 1];
    const red = bitmap[offset + 2];
    const alpha = bitmap[offset + 3];
    const luminance = (red + green + blue) / 3;
    alphaTotal += alpha;
    luminanceTotal += luminance;
    minLuminance = Math.min(minLuminance, luminance);
    maxLuminance = Math.max(maxLuminance, luminance);
    samples += 1;
  }

  return {
    width: size.width,
    height: size.height,
    pngBytes: pngLength,
    averageAlpha: Number((alphaTotal / samples).toFixed(2)),
    averageLuminance: Number((luminanceTotal / samples).toFixed(2)),
    luminanceRange: Number((maxLuminance - minLuminance).toFixed(2))
  };
}

async function captureSmoke(name) {
  const screenshotsDirectory = path.join(smokeOutputDirectory, 'screenshots');
  await fs.mkdir(screenshotsDirectory, { recursive: true });

  const image = await overlayWindow.webContents.capturePage();
  const png = image.toPNG();
  const filePath = path.join(screenshotsDirectory, `${name}.png`);
  await fs.writeFile(filePath, png);

  return {
    name,
    filePath,
    analysis: analyzeImage(image, png.length)
  };
}

async function executeInRenderer(script) {
  return overlayWindow.webContents.executeJavaScript(script, true);
}

async function waitForSmokeApi() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const ready = await executeInRenderer('Boolean(window.focusVeilSmoke)');
    if (ready) {
      return;
    }
    await sleep(100);
  }

  throw new Error('Timed out waiting for window.focusVeilSmoke.');
}

function assertSmoke(assertions, name, pass, details = {}) {
  assertions.push({ name, pass, details });
}

async function runSmoke() {
  const assertions = [];
  const screenshots = [];
  const reportPath = path.join(smokeOutputDirectory, 'smoke-report.json');

  try {
    await waitForSmokeApi();
    await executeInRenderer('window.focusVeilSmoke.setMouse(640, 360)');
    await sleep(500);

    screenshots.push(await captureSmoke('normal'));
    const normalState = await executeInRenderer('window.focusVeilSmoke.getState()');
    assertSmoke(assertions, 'normal mode hides controls', !normalState.controlsVisible, normalState);

    const operationState = await executeInRenderer('window.focusVeilSmoke.setOperationMode(true)');
    await sleep(300);
    screenshots.push(await captureSmoke('operation'));
    assertSmoke(
      assertions,
      'operation mode shows controls',
      operationState.operationMode && operationState.controlsVisible,
      operationState
    );

    await executeInRenderer('window.focusVeilSmoke.click("start")');
    await sleep(900);
    const runningState = await executeInRenderer('window.focusVeilSmoke.getState()');
    assertSmoke(
      assertions,
      'start button runs timer',
      runningState.running && runningState.remaining < 4,
      runningState
    );

    const pausedState = await executeInRenderer('window.focusVeilSmoke.click("pause")');
    assertSmoke(assertions, 'pause button stops timer', !pausedState.running, pausedState);

    const resetState = await executeInRenderer('window.focusVeilSmoke.click("reset")');
    assertSmoke(
      assertions,
      'reset button restores work duration',
      !resetState.running && resetState.phase === 'work' && resetState.timeText === '0:04',
      resetState
    );

    await executeInRenderer('window.focusVeilSmoke.click("start")');
    await sleep(4200);
    screenshots.push(await captureSmoke('notification'));
    const transitionState = await executeInRenderer('window.focusVeilSmoke.getState()');
    assertSmoke(
      assertions,
      'short timer transitions to break and triggers notification',
      transitionState.phase === 'break' &&
        !transitionState.running &&
        transitionState.notificationCount >= 1,
      transitionState
    );

    for (const screenshot of screenshots) {
      assertSmoke(
        assertions,
        `${screenshot.name} screenshot is nonblank`,
        screenshot.analysis.pngBytes > 10000 && screenshot.analysis.luminanceRange > 24,
        screenshot.analysis
      );
    }

    const failedAssertions = assertions.filter((assertion) => !assertion.pass);
    const report = {
      status: failedAssertions.length === 0 ? 'passed' : 'failed',
      createdAt: new Date().toISOString(),
      assertions,
      screenshots
    };

    await fs.mkdir(smokeOutputDirectory, { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`FOCUS_VEIL_SMOKE_REPORT ${reportPath}`);

    if (failedAssertions.length > 0) {
      app.exit(1);
      return;
    }

    app.quit();
  } catch (error) {
    const report = {
      status: 'error',
      createdAt: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      assertions,
      screenshots
    };
    await fs.mkdir(smokeOutputDirectory, { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.error(error);
    app.exit(1);
  }
}

function maybeRunSmoke() {
  if (!isSmoke || smokeStarted || !rendererLoaded || !windowShown) {
    return;
  }

  smokeStarted = true;
  setTimeout(runSmoke, 250);
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
      smoke: isSmoke ? '1' : '0',
      preview: isSmoke ? '1' : '0'
    }
  });

  overlayWindow.once('ready-to-show', () => {
    windowShown = true;
    overlayWindow.showInactive();
    sendOperationMode('ready');
    maybeRunSmoke();
  });

  overlayWindow.webContents.once('did-finish-load', () => {
    rendererLoaded = true;
    console.log('FOCUS_VEIL_READY');
    maybeRunSmoke();
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
