const path = require('node:path');
const fs = require('node:fs/promises');
const {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  screen
} = require('electron');

const isSmoke = process.argv.includes('--smoke');
const smokeOutputDirectory = path.join(__dirname, '..', 'artifacts');
const timerDurations = {
  work: isSmoke ? 4 : 25 * 60,
  break: isSmoke ? 2 : 5 * 60
};

const overlayWindows = new Map();

let controlWindow = null;
let operationMode = false;
let smokeStarted = false;
let controlWindowLoaded = false;
let controlWindowShown = false;
let rebuildingOverlays = false;

const timerState = {
  phase: 'work',
  running: false,
  remaining: timerDurations.work,
  lastTick: Date.now(),
  notificationCount: 0
};

function getSmokeDescriptor() {
  return {
    key: 'smoke',
    bounds: { x: 80, y: 80, width: 1280, height: 720 },
    displayId: null,
    controls: true,
    preview: true
  };
}

function getDisplayDescriptors() {
  if (isSmoke) {
    return [getSmokeDescriptor()];
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((display) => ({
    key: `display-${display.id}`,
    displayId: String(display.id),
    bounds: display.bounds,
    controls: display.id === primaryDisplay.id,
    preview: false
  }));
}

function getOverlayList() {
  return [...overlayWindows.values()].filter((win) => !win.isDestroyed());
}

function sendToWindow(win, channel, payload) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
    return;
  }

  win.webContents.send(channel, payload);
}

function tickTimerState(now = Date.now()) {
  if (!timerState.running) {
    timerState.lastTick = now;
    return false;
  }

  const elapsed = (now - timerState.lastTick) / 1000;
  timerState.lastTick = now;
  timerState.remaining -= elapsed;

  if (timerState.remaining > 0) {
    return true;
  }

  timerState.phase = timerState.phase === 'work' ? 'break' : 'work';
  timerState.remaining = timerDurations[timerState.phase];
  timerState.running = false;
  timerState.notificationCount += 1;
  return true;
}

function getTimerSnapshot() {
  tickTimerState();

  return {
    phase: timerState.phase,
    running: timerState.running,
    remaining: Number(Math.max(0, timerState.remaining).toFixed(2)),
    notificationCount: timerState.notificationCount
  };
}

function broadcastTimerState(source = 'main') {
  const payload = {
    ...getTimerSnapshot(),
    source
  };

  for (const win of getOverlayList()) {
    sendToWindow(win, 'focus-veil:timer-state', payload);
  }
}

function handleTimerCommand(action) {
  tickTimerState();

  if (action === 'start') {
    timerState.running = true;
    timerState.lastTick = Date.now();
  } else if (action === 'pause') {
    timerState.running = false;
  } else if (action === 'reset') {
    timerState.running = false;
    timerState.remaining = timerDurations[timerState.phase];
    timerState.lastTick = Date.now();
  }

  broadcastTimerState(`timer:${action}`);
  return getTimerSnapshot();
}

function applyOperationModeToWindow(win) {
  if (!win || win.isDestroyed()) {
    return;
  }

  const controls = Boolean(win.focusVeilControls);

  if (operationMode && controls) {
    win.setFocusable(true);
    win.setIgnoreMouseEvents(false);
    win.show();
    win.focus();
  } else {
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setFocusable(false);
    win.blur();
    win.showInactive();
  }

  win.setAlwaysOnTop(true, 'screen-saver');
}

function sendOperationMode(source) {
  for (const win of getOverlayList()) {
    sendToWindow(win, 'focus-veil:operation-mode', {
      enabled: operationMode,
      source
    });
  }
}

function setOperationMode(enabled, source = 'main') {
  operationMode = enabled;

  for (const win of getOverlayList()) {
    applyOperationModeToWindow(win);
  }

  sendOperationMode(source);
}

function registerShortcuts() {
  const toggleRegistered = globalShortcut.register('CommandOrControl+Shift+F', () => {
    setOperationMode(!operationMode, 'shortcut');
  });

  if (!toggleRegistered) {
    console.warn('Focus Veil: failed to register CommandOrControl+Shift+F.');
  }

  const refreshRegistered = globalShortcut.register('CommandOrControl+Shift+R', () => {
    rebuildOverlayWindows('shortcut-refresh');
  });

  if (!refreshRegistered) {
    console.warn('Focus Veil: failed to register CommandOrControl+Shift+R.');
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

  const image = await controlWindow.webContents.capturePage();
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
  return controlWindow.webContents.executeJavaScript(script, true);
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

    const motionState = await executeInRenderer('window.focusVeilSmoke.simulateMotion(260, 190, 0.85)');
    await sleep(450);
    screenshots.push(await captureSmoke('motion-focus'));
    assertSmoke(
      assertions,
      'motion focus accepts moving target',
      motionState.motionStrength > 0.5 &&
        Math.abs(motionState.motionTargetX - 260) < 2 &&
        Math.abs(motionState.motionTargetY - 190) < 2,
      motionState
    );

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
  if (!isSmoke || smokeStarted || !controlWindowLoaded || !controlWindowShown) {
    return;
  }

  smokeStarted = true;
  setTimeout(runSmoke, 250);
}

function buildWindowOptions(descriptor) {
  return {
    ...descriptor.bounds,
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
  };
}

function createOverlayWindow(descriptor) {
  const win = new BrowserWindow(buildWindowOptions(descriptor));
  win.focusVeilKey = descriptor.key;
  win.focusVeilDisplayId = descriptor.displayId;
  win.focusVeilControls = descriptor.controls;

  overlayWindows.set(descriptor.key, win);

  if (descriptor.controls) {
    controlWindow = win;
  }

  win.setMenuBarVisibility(false);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setContentProtection(true);

  try {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch {
    // Best effort only. Electron documents this as unsupported on Windows.
  }

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), {
    query: {
      smoke: isSmoke ? '1' : '0',
      preview: descriptor.preview ? '1' : '0',
      controls: descriptor.controls ? '1' : '0',
      display: descriptor.key,
      motion: '1'
    }
  });

  win.once('ready-to-show', () => {
    win.showInactive();
    applyOperationModeToWindow(win);
    sendOperationMode('ready');
    sendToWindow(win, 'focus-veil:timer-state', getTimerSnapshot());

    if (descriptor.controls) {
      controlWindowShown = true;
      maybeRunSmoke();
    }
  });

  win.webContents.once('did-finish-load', () => {
    console.log(`FOCUS_VEIL_READY ${descriptor.key}`);
    sendOperationMode('load');
    sendToWindow(win, 'focus-veil:timer-state', getTimerSnapshot());

    if (descriptor.controls) {
      controlWindowLoaded = true;
      maybeRunSmoke();
    }
  });

  win.on('closed', () => {
    overlayWindows.delete(descriptor.key);
    if (controlWindow === win) {
      controlWindow = null;
    }
  });

  return win;
}

function createOverlayWindows() {
  controlWindow = null;
  controlWindowLoaded = false;
  controlWindowShown = false;

  for (const descriptor of getDisplayDescriptors()) {
    createOverlayWindow(descriptor);
  }
}

function rebuildOverlayWindows(source = 'rebuild') {
  if (!app.isReady()) {
    return;
  }

  rebuildingOverlays = true;

  for (const win of getOverlayList()) {
    win.destroy();
  }

  overlayWindows.clear();
  createOverlayWindows();

  setTimeout(() => {
    setOperationMode(operationMode, source);
    broadcastTimerState(source);
    rebuildingOverlays = false;
  }, 500);
}

function maintainOverlayPresence() {
  if (isSmoke || operationMode || overlayWindows.size === 0) {
    return;
  }

  const windows = getOverlayList();
  const hiddenCount = windows.filter((win) => !win.isVisible()).length;

  if (hiddenCount === windows.length) {
    rebuildOverlayWindows('visibility-refresh');
    return;
  }

  for (const win of windows) {
    win.setAlwaysOnTop(true, 'screen-saver');
    win.showInactive();
  }
}

ipcMain.handle('focus-veil:set-operation-mode', (_event, enabled) => {
  setOperationMode(Boolean(enabled), 'renderer');
  return { enabled: operationMode };
});

ipcMain.handle('focus-veil:get-main-state', () => ({
  operationMode,
  smoke: isSmoke,
  timer: getTimerSnapshot(),
  overlays: getOverlayList().map((win) => ({
    key: win.focusVeilKey,
    controls: Boolean(win.focusVeilControls),
    bounds: win.getBounds()
  }))
}));

ipcMain.handle('focus-veil:timer-command', (_event, action) => handleTimerCommand(action));

ipcMain.handle('focus-veil:get-capture-source', async (event) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  const displayId = senderWindow?.focusVeilDisplayId;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 0, height: 0 }
  });

  const source =
    sources.find((candidate) => candidate.display_id === displayId) ??
    sources.find((candidate) => candidate.display_id) ??
    sources[0];

  if (!source) {
    return null;
  }

  return {
    id: source.id,
    name: source.name,
    displayId: source.display_id
  };
});

app.whenReady().then(() => {
  createOverlayWindows();
  registerShortcuts();

  screen.on('display-added', () => rebuildOverlayWindows('display-added'));
  screen.on('display-removed', () => rebuildOverlayWindows('display-removed'));
  screen.on('display-metrics-changed', () => rebuildOverlayWindows('display-metrics-changed'));

  setInterval(() => broadcastTimerState('tick'), 250);
  setInterval(maintainOverlayPresence, 2500);
});

app.on('window-all-closed', () => {
  if (rebuildingOverlays) {
    return;
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createOverlayWindows();
  }
});
