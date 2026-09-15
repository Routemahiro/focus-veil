const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  session,
  Tray,
  screen
} = require('electron');

const isSmoke = process.argv.includes('--smoke');
let koffi = null;

if (process.platform === 'win32' && !isSmoke) {
  try {
    koffi = require('koffi');
  } catch (error) {
    console.warn('Focus Veil: native window tracking unavailable.', error);
  }
}

const smokeOutputDirectory = path.join(__dirname, '..', 'artifacts');
const rendererEntryPath = path.join(__dirname, 'renderer', 'index.html');
const rendererEntryUrl = pathToFileURL(rendererEntryPath).href;
const settingsFileName = 'settings.json';
const timerActions = new Set(['start', 'pause', 'reset']);
const activeWindowPollIntervalMs = 250;
const defaultSettings = {
  veilEnabled: true,
  motionEnabled: true,
  veilAlpha: 0.16,
  spotlightRadius: 245,
  spotlightSoftness: 0.68,
  workMinutes: 25,
  breakMinutes: 5
};

const overlayWindows = new Map();

let controlWindow = null;
let tray = null;
let operationMode = false;
let smokeStarted = false;
let controlWindowLoaded = false;
let controlWindowShown = false;
let rebuildingOverlays = false;
let settings = { ...defaultSettings };
let settingsSaveTimer = null;
let timerBroadcastInterval = null;
let activeDisplayKey = null;
let activeWindowPollInterval = null;
let nativeWindowApi = null;
let activeWindowPayloadSignature = '';
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

const timerState = {
  phase: 'work',
  running: false,
  remaining: getTimerDuration('work'),
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function readNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return clamp(number, min, max);
}

function normalizeSettings(candidate = {}) {
  return {
    veilEnabled: readBoolean(candidate.veilEnabled, defaultSettings.veilEnabled),
    motionEnabled: readBoolean(candidate.motionEnabled, defaultSettings.motionEnabled),
    veilAlpha: Number(
      readNumber(candidate.veilAlpha, defaultSettings.veilAlpha, 0.04, 0.3).toFixed(3)
    ),
    spotlightRadius: Math.round(
      readNumber(candidate.spotlightRadius, defaultSettings.spotlightRadius, 140, 360)
    ),
    spotlightSoftness: Number(
      readNumber(
        candidate.spotlightSoftness,
        defaultSettings.spotlightSoftness,
        0.35,
        0.9
      ).toFixed(2)
    ),
    workMinutes: Math.round(readNumber(candidate.workMinutes, defaultSettings.workMinutes, 1, 180)),
    breakMinutes: Math.round(readNumber(candidate.breakMinutes, defaultSettings.breakMinutes, 1, 60))
  };
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), settingsFileName);
}

function getTimerDuration(phase) {
  if (isSmoke) {
    return phase === 'work' ? 4 : 2;
  }

  return phase === 'work' ? settings.workMinutes * 60 : settings.breakMinutes * 60;
}

function getSettingsSnapshot() {
  return { ...settings };
}

async function loadSettings() {
  if (isSmoke) {
    settings = { ...defaultSettings };
    return;
  }

  try {
    const raw = await fs.readFile(getSettingsPath(), 'utf8');
    settings = normalizeSettings({
      ...defaultSettings,
      ...JSON.parse(raw)
    });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Focus Veil: failed to read settings, using defaults.', error);
    }
    settings = { ...defaultSettings };
  }

  timerState.remaining = getTimerDuration(timerState.phase);
}

async function saveSettingsNow() {
  if (isSmoke) {
    return;
  }

  const settingsPath = getSettingsPath();
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

function scheduleSettingsSave() {
  if (isSmoke) {
    return;
  }

  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(() => {
    saveSettingsNow().catch((error) => {
      console.warn('Focus Veil: failed to save settings.', error);
    });
  }, 300);
}

function broadcastSettings(source = 'main') {
  const payload = {
    settings: getSettingsSnapshot(),
    source
  };

  for (const win of getOverlayList()) {
    sendToWindow(win, 'focus-veil:settings-state', payload);
  }
}

function updateSettings(patch = {}, source = 'main') {
  const previousWorkMinutes = settings.workMinutes;
  const previousBreakMinutes = settings.breakMinutes;
  settings = normalizeSettings({
    ...settings,
    ...patch
  });

  const durationChanged =
    previousWorkMinutes !== settings.workMinutes || previousBreakMinutes !== settings.breakMinutes;

  if (durationChanged && !timerState.running) {
    timerState.remaining = getTimerDuration(timerState.phase);
  }

  scheduleSettingsSave();
  broadcastSettings(source);

  if (durationChanged) {
    broadcastTimerState('settings');
  }

  updateTrayMenu();
  return getSettingsSnapshot();
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

function getDisplayKey(display) {
  return display ? `display-${display.id}` : null;
}

function getDisplayKeyForPoint(point) {
  if (isSmoke) {
    return getSmokeDescriptor().key;
  }

  return getDisplayKey(screen.getDisplayNearestPoint(point));
}

function detectActiveDisplayKey() {
  if (isSmoke) {
    return getSmokeDescriptor().key;
  }

  return getDisplayKeyForPoint(screen.getCursorScreenPoint());
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

function broadcastActiveDisplay(source = 'main') {
  const nextActiveDisplayKey = activeDisplayKey ?? detectActiveDisplayKey();
  const payload = {
    activeDisplayKey: nextActiveDisplayKey,
    source
  };

  for (const win of getOverlayList()) {
    sendToWindow(win, 'focus-veil:active-display', payload);
  }
}

function setActiveDisplayKey(key, source = 'main', options = {}) {
  if (!key || (!isSmoke && !overlayWindows.has(key))) {
    return false;
  }

  if (!options.force && activeDisplayKey === key) {
    return false;
  }

  activeDisplayKey = key;
  broadcastActiveDisplay(source);
  return true;
}

function refreshActiveDisplay(source = 'main', options = {}) {
  return setActiveDisplayKey(detectActiveDisplayKey(), source, options);
}

function isTrustedRendererUrl(url) {
  return typeof url === 'string' && url.startsWith(rendererEntryUrl);
}

function assertTrustedIpcEvent(event) {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  const senderFrameUrl = event.senderFrame?.url ?? event.sender.getURL();

  if (
    !senderWindow ||
    senderWindow.isDestroyed() ||
    !getOverlayList().includes(senderWindow) ||
    !isTrustedRendererUrl(senderFrameUrl)
  ) {
    throw new Error('Rejected IPC from an untrusted renderer.');
  }

  return senderWindow;
}

function getRectArea(rect) {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function getRectIntersection(rect, bounds) {
  const left = Math.max(rect.x, bounds.x);
  const top = Math.max(rect.y, bounds.y);
  const right = Math.min(rect.x + rect.width, bounds.x + bounds.width);
  const bottom = Math.min(rect.y + rect.height, bounds.y + bounds.height);

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

function roundRect(rect) {
  if (!rect) {
    return null;
  }

  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

function nativeHandleToBigInt(handle) {
  if (typeof handle === 'bigint') {
    return handle;
  }

  if (typeof handle === 'number') {
    return BigInt(handle);
  }

  if (!Buffer.isBuffer(handle) || handle.length === 0) {
    return null;
  }

  return handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0));
}

function isOverlayNativeHandle(handle) {
  const normalized = nativeHandleToBigInt(handle);
  if (!normalized) {
    return false;
  }

  return getOverlayList().some((win) => {
    try {
      return nativeHandleToBigInt(win.getNativeWindowHandle()) === normalized;
    } catch {
      return false;
    }
  });
}

function getNativeWindowApi() {
  if (nativeWindowApi !== null) {
    return nativeWindowApi;
  }

  nativeWindowApi = false;

  if (!koffi) {
    return null;
  }

  try {
    const rect = koffi.struct('RECT', {
      left: 'long',
      top: 'long',
      right: 'long',
      bottom: 'long'
    });
    const user32 = koffi.load('user32.dll');
    const dwmapi = koffi.load('dwmapi.dll');

    nativeWindowApi = {
      rect,
      getForegroundWindow: user32.func('void* __stdcall GetForegroundWindow()'),
      getWindowRect: user32.func('bool __stdcall GetWindowRect(void* hWnd, _Out_ RECT* rect)'),
      isWindowVisible: user32.func('bool __stdcall IsWindowVisible(void* hWnd)'),
      isIconic: user32.func('bool __stdcall IsIconic(void* hWnd)'),
      dwmGetWindowAttribute: dwmapi.func(
        'long __stdcall DwmGetWindowAttribute(void* hwnd, uint32 attr, _Out_ RECT* rect, uint32 cb)'
      )
    };
  } catch (error) {
    nativeWindowApi = false;
    console.warn('Focus Veil: failed to initialize native window tracking.', error);
  }

  return nativeWindowApi || null;
}

function win32RectToBounds(rect) {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;

  if (width <= 12 || height <= 12) {
    return null;
  }

  return {
    x: rect.left,
    y: rect.top,
    width,
    height
  };
}

function getForegroundWindowDipRect() {
  const api = getNativeWindowApi();
  if (!api) {
    return null;
  }

  try {
    const hwnd = api.getForegroundWindow();
    if (!hwnd || hwnd === 0n || isOverlayNativeHandle(hwnd)) {
      return null;
    }

    if (!api.isWindowVisible(hwnd) || api.isIconic(hwnd)) {
      return null;
    }

    const frameRect = {};
    const frameResult = api.dwmGetWindowAttribute(hwnd, 9, frameRect, koffi.sizeof(api.rect));
    const windowRect = {};
    const usedRect =
      frameResult === 0 && win32RectToBounds(frameRect)
        ? frameRect
        : api.getWindowRect(hwnd, windowRect)
          ? windowRect
          : null;
    const physicalRect = usedRect ? win32RectToBounds(usedRect) : null;

    if (!physicalRect) {
      return null;
    }

    return roundRect(screen.screenToDipRect(null, physicalRect));
  } catch (error) {
    console.warn('Focus Veil: failed to read foreground window bounds.', error);
    return null;
  }
}

function isFullscreenLikeRect(rect, displayBounds) {
  const intersection = getRectIntersection(rect, displayBounds);
  if (!intersection) {
    return false;
  }

  const displayArea = getRectArea(displayBounds);
  const coverage = getRectArea(intersection) / Math.max(1, displayArea);
  const nearlySameSize =
    Math.abs(rect.width - displayBounds.width) <= 3 &&
    Math.abs(rect.height - displayBounds.height) <= 3;

  return coverage > 0.985 && nearlySameSize;
}

function getForegroundWindowRectsByDisplay() {
  const foregroundRect = getForegroundWindowDipRect();
  const rectsByDisplay = new Map();

  if (!foregroundRect) {
    return rectsByDisplay;
  }

  const matchingDisplay = screen.getDisplayMatching(foregroundRect);
  if (isFullscreenLikeRect(foregroundRect, matchingDisplay.bounds)) {
    return rectsByDisplay;
  }

  for (const display of screen.getAllDisplays()) {
    const intersection = getRectIntersection(foregroundRect, display.bounds);
    if (!intersection || getRectArea(intersection) < 900) {
      continue;
    }

    rectsByDisplay.set(
      getDisplayKey(display),
      roundRect({
        x: intersection.x - display.bounds.x,
        y: intersection.y - display.bounds.y,
        width: intersection.width,
        height: intersection.height
      })
    );
  }

  return rectsByDisplay;
}

function getActiveWindowPayloadSignature(rectsByDisplay) {
  return getOverlayList()
    .map((win) => {
      const rect = rectsByDisplay.get(win.focusVeilKey);
      if (!rect) {
        return `${win.focusVeilKey}:none`;
      }

      return `${win.focusVeilKey}:${rect.x},${rect.y},${rect.width},${rect.height}`;
    })
    .join('|');
}

function broadcastActiveWindowState(source = 'main', options = {}) {
  const rectsByDisplay = getForegroundWindowRectsByDisplay();
  const signature = getActiveWindowPayloadSignature(rectsByDisplay);

  if (!options.force && signature === activeWindowPayloadSignature) {
    return false;
  }

  activeWindowPayloadSignature = signature;

  for (const win of getOverlayList()) {
    sendToWindow(win, 'focus-veil:active-window', {
      displayKey: win.focusVeilKey,
      rect: rectsByDisplay.get(win.focusVeilKey) ?? null,
      source
    });
  }

  return true;
}

function startActiveWindowTracking() {
  if (activeWindowPollInterval || isSmoke) {
    return;
  }

  activeWindowPollInterval = setInterval(() => {
    broadcastActiveWindowState('foreground');
  }, activeWindowPollIntervalMs);
}

function stopActiveWindowTracking() {
  if (!activeWindowPollInterval) {
    return;
  }

  clearInterval(activeWindowPollInterval);
  activeWindowPollInterval = null;
}

function hardenWebContents(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isTrustedRendererUrl(targetUrl)) {
      event.preventDefault();
    }
  });
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
  timerState.remaining = getTimerDuration(timerState.phase);
  timerState.running = false;
  timerState.notificationCount += 1;
  updateTrayMenu();
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

function stopTimerBroadcastInterval() {
  if (!timerBroadcastInterval) {
    return;
  }

  clearInterval(timerBroadcastInterval);
  timerBroadcastInterval = null;
}

function startTimerBroadcastInterval() {
  if (timerBroadcastInterval) {
    return;
  }

  timerBroadcastInterval = setInterval(() => {
    broadcastTimerState('tick');

    if (!timerState.running) {
      stopTimerBroadcastInterval();
    }
  }, 250);
}

function handleTimerCommand(action) {
  if (!timerActions.has(action)) {
    throw new Error(`Unsupported timer action: ${action}`);
  }

  tickTimerState();

  if (action === 'start') {
    timerState.running = true;
    timerState.lastTick = Date.now();
  } else if (action === 'pause') {
    timerState.running = false;
  } else if (action === 'reset') {
    timerState.running = false;
    timerState.remaining = getTimerDuration(timerState.phase);
    timerState.lastTick = Date.now();
  }

  if (timerState.running) {
    startTimerBroadcastInterval();
  } else {
    stopTimerBroadcastInterval();
  }

  broadcastTimerState(`timer:${action}`);
  updateTrayMenu();
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

  if (operationMode && controlWindow && !controlWindow.isDestroyed()) {
    setActiveDisplayKey(controlWindow.focusVeilKey, source);
  } else {
    refreshActiveDisplay(source, { force: true });
  }

  broadcastActiveWindowState(source, { force: true });
  sendOperationMode(source);
  updateTrayMenu();
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

function createTrayIcon() {
  const size = 16;
  const bitmap = Buffer.alloc(size * size * 4);
  const center = (size - 1) / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const distance = Math.hypot(x - center, y - center);
      const ring = distance <= 7 && distance >= 4.4;
      const core = distance < 3.2;
      const alpha = ring ? 235 : core ? 205 : 0;

      bitmap[offset] = core ? 64 : 216;
      bitmap[offset + 1] = core ? 91 : 226;
      bitmap[offset + 2] = core ? 95 : 166;
      bitmap[offset + 3] = alpha;
    }
  }

  return nativeImage.createFromBitmap(bitmap, {
    width: size,
    height: size,
    scaleFactor: 1
  });
}

function formatTrayTime() {
  const remaining = Math.max(0, Math.ceil(timerState.remaining));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${timerState.phase === 'work' ? 'Focus' : 'Break'} ${minutes}:${seconds
    .toString()
    .padStart(2, '0')}`;
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  const template = [
    {
      label: `Focus Veil - ${formatTrayTime()}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: timerState.running ? 'Pause Timer' : 'Start Timer',
      click: () => handleTimerCommand(timerState.running ? 'pause' : 'start')
    },
    {
      label: 'Reset Timer',
      click: () => handleTimerCommand('reset')
    },
    { type: 'separator' },
    {
      label: 'Operation Mode',
      type: 'checkbox',
      checked: operationMode,
      click: (item) => setOperationMode(item.checked, 'tray')
    },
    {
      label: 'Overlay Enabled',
      type: 'checkbox',
      checked: settings.veilEnabled,
      click: (item) => updateSettings({ veilEnabled: item.checked }, 'tray')
    },
    {
      label: 'Motion Highlight',
      type: 'checkbox',
      checked: settings.motionEnabled,
      click: (item) => updateSettings({ motionEnabled: item.checked }, 'tray')
    },
    {
      label: 'Veil Strength',
      submenu: [
        {
          label: 'Light',
          type: 'radio',
          checked: settings.veilAlpha <= 0.11,
          click: () => updateSettings({ veilAlpha: 0.1 }, 'tray')
        },
        {
          label: 'Normal',
          type: 'radio',
          checked: settings.veilAlpha > 0.11 && settings.veilAlpha < 0.18,
          click: () => updateSettings({ veilAlpha: 0.16 }, 'tray')
        },
        {
          label: 'Deep',
          type: 'radio',
          checked: settings.veilAlpha >= 0.18,
          click: () => updateSettings({ veilAlpha: 0.2 }, 'tray')
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'Refresh Overlay Windows',
      click: () => rebuildOverlayWindows('tray-refresh')
    },
    {
      label: 'Quit Focus Veil',
      click: async () => {
        clearTimeout(settingsSaveTimer);
        await saveSettingsNow().catch((error) => {
          console.warn('Focus Veil: failed to save settings before quit.', error);
        });
        app.quit();
      }
    }
  ];

  tray.setToolTip(`Focus Veil - ${formatTrayTime()}`);
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  if (tray || isSmoke) {
    return;
  }

  tray = new Tray(createTrayIcon());
  tray.on('click', () => setOperationMode(!operationMode, 'tray-click'));
  updateTrayMenu();
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

    await executeInRenderer('window.focusVeilSmoke.setActiveDisplay(false)');
    await sleep(480);
    screenshots.push(await captureSmoke('inactive-display'));
    const inactiveDisplayState = await executeInRenderer('window.focusVeilSmoke.getState()');
    assertSmoke(
      assertions,
      'inactive display fades out mouse spotlight',
      !inactiveDisplayState.isActiveDisplay && inactiveDisplayState.spotlightPresence < 0.08,
      inactiveDisplayState
    );

    await executeInRenderer('window.focusVeilSmoke.setActiveDisplay(true)');
    await sleep(220);

    await executeInRenderer(
      'window.focusVeilSmoke.setActiveWindowRect({ x: 250, y: 150, width: 620, height: 330 })'
    );
    await sleep(480);
    screenshots.push(await captureSmoke('active-window-glow'));
    const activeWindowState = await executeInRenderer('window.focusVeilSmoke.getState()');
    assertSmoke(
      assertions,
      'active window glow accepts foreground rectangle',
      activeWindowState.activeWindowPresence > 0.88 &&
        Math.abs(activeWindowState.activeWindowRect.x - 250) < 8 &&
        Math.abs(activeWindowState.activeWindowRect.width - 620) < 8,
      activeWindowState
    );

    await executeInRenderer('window.focusVeilSmoke.setActiveWindowRect(null)');
    await sleep(220);

    const spotlightSettingsState = await executeInRenderer(
      'window.focusVeilSmoke.setSettings({ veilAlpha: 0.16, spotlightRadius: 270, spotlightSoftness: 0.78 })'
    );
    assertSmoke(
      assertions,
      'spotlight settings update through IPC',
      spotlightSettingsState.settings.veilAlpha === 0.16 &&
        spotlightSettingsState.settings.spotlightRadius === 270 &&
        spotlightSettingsState.settings.spotlightSoftness === 0.78,
      spotlightSettingsState
    );

    const motionState = await executeInRenderer('window.focusVeilSmoke.simulateMotion(260, 190, 0.85)');
    await sleep(450);
    screenshots.push(await captureSmoke('motion-highlight'));
    const focusedMotionState = await executeInRenderer('window.focusVeilSmoke.getState()');
    assertSmoke(
      assertions,
      'motion highlight accepts moving region',
      motionState.motionHighlightCount > 0 &&
        Math.abs(motionState.motionStrongestX - 260) < 2 &&
        Math.abs(motionState.motionStrongestY - 190) < 2,
      motionState
    );
    assertSmoke(
      assertions,
      'motion highlight keeps mouse spotlight independent',
      Math.abs(focusedMotionState.motionStrongestX - 260) < 80 &&
        Math.abs(focusedMotionState.motionStrongestY - 190) < 60 &&
        Math.abs(focusedMotionState.mouseX - 640) < 2 &&
        Math.abs(focusedMotionState.mouseY - 360) < 2,
      focusedMotionState
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
    assertSmoke(
      assertions,
      'operation mode shows shortcut hint',
      operationState.shortcutHint === 'ショートカット：Ctrl+Shift+F' &&
        operationState.shortcutHintVisible,
      operationState
    );

    const dismissedState = await executeInRenderer('window.focusVeilSmoke.dismissOperationMenu()');
    await sleep(200);
    assertSmoke(
      assertions,
      'click outside operation menu closes it',
      !dismissedState.operationMode && !dismissedState.controlsVisible,
      dismissedState
    );

    const reopenedState = await executeInRenderer('window.focusVeilSmoke.setOperationMode(true)');
    await sleep(200);
    assertSmoke(
      assertions,
      'operation mode can reopen after outside click',
      reopenedState.operationMode && reopenedState.controlsVisible,
      reopenedState
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
  hardenWebContents(win);

  try {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch {
    // Best effort only. Electron documents this as unsupported on Windows.
  }

  win.loadFile(rendererEntryPath, {
    query: {
      smoke: isSmoke ? '1' : '0',
      preview: descriptor.preview ? '1' : '0',
      controls: descriptor.controls ? '1' : '0',
      display: descriptor.key,
      motion: settings.motionEnabled ? '1' : '0'
    }
  });

  win.once('ready-to-show', () => {
    win.showInactive();
    applyOperationModeToWindow(win);
    sendOperationMode('ready');
    sendToWindow(win, 'focus-veil:timer-state', getTimerSnapshot());
    sendToWindow(win, 'focus-veil:settings-state', {
      settings: getSettingsSnapshot(),
      source: 'ready'
    });
    sendToWindow(win, 'focus-veil:active-display', {
      activeDisplayKey: activeDisplayKey ?? detectActiveDisplayKey(),
      source: 'ready'
    });
    broadcastActiveWindowState('ready', { force: true });

    if (descriptor.controls) {
      controlWindowShown = true;
      maybeRunSmoke();
    }
  });

  win.webContents.once('did-finish-load', () => {
    console.log(`FOCUS_VEIL_READY ${descriptor.key}`);
    sendOperationMode('load');
    sendToWindow(win, 'focus-veil:timer-state', getTimerSnapshot());
    sendToWindow(win, 'focus-veil:settings-state', {
      settings: getSettingsSnapshot(),
      source: 'load'
    });
    sendToWindow(win, 'focus-veil:active-display', {
      activeDisplayKey: activeDisplayKey ?? detectActiveDisplayKey(),
      source: 'load'
    });
    broadcastActiveWindowState('load', { force: true });

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
  activeWindowPayloadSignature = '';

  for (const descriptor of getDisplayDescriptors()) {
    createOverlayWindow(descriptor);
  }

  refreshActiveDisplay('create', { force: true });
  broadcastActiveWindowState('create', { force: true });
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
    refreshActiveDisplay(source, { force: true });
    broadcastActiveWindowState(source, { force: true });
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
    const needsVisibilityRestore = !win.isVisible();
    const needsTopRestore = typeof win.isAlwaysOnTop === 'function' && !win.isAlwaysOnTop();

    if (!needsVisibilityRestore && !needsTopRestore) {
      continue;
    }

    if (needsTopRestore) {
      win.setAlwaysOnTop(true, 'screen-saver');
    }

    win.showInactive();
  }
}

ipcMain.handle('focus-veil:set-operation-mode', (event, enabled) => {
  assertTrustedIpcEvent(event);
  setOperationMode(Boolean(enabled), 'renderer');
  return { enabled: operationMode };
});

ipcMain.on('focus-veil:cursor-activity', (event) => {
  const senderWindow = assertTrustedIpcEvent(event);
  setActiveDisplayKey(senderWindow.focusVeilKey, 'cursor');
});

ipcMain.handle('focus-veil:get-main-state', (event) => {
  assertTrustedIpcEvent(event);
  return {
    operationMode,
    smoke: isSmoke,
    activeDisplayKey: activeDisplayKey ?? detectActiveDisplayKey(),
    settings: getSettingsSnapshot(),
    timer: getTimerSnapshot(),
    overlays: getOverlayList().map((win) => ({
      key: win.focusVeilKey,
      controls: Boolean(win.focusVeilControls),
      bounds: win.getBounds()
    }))
  };
});

ipcMain.handle('focus-veil:timer-command', (event, action) => {
  assertTrustedIpcEvent(event);
  return handleTimerCommand(action);
});

ipcMain.handle('focus-veil:update-settings', (event, patch) => {
  assertTrustedIpcEvent(event);
  return updateSettings(patch, 'renderer');
});

ipcMain.handle('focus-veil:get-capture-source', async (event) => {
  const senderWindow = assertTrustedIpcEvent(event);
  if (!settings.motionEnabled) {
    return null;
  }

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

function configureSessionSecurity() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const senderWindow = BrowserWindow.fromWebContents(webContents);
    const trusted =
      senderWindow &&
      !senderWindow.isDestroyed() &&
      getOverlayList().includes(senderWindow) &&
      isTrustedRendererUrl(webContents.getURL());

    callback(Boolean(trusted && ['media', 'display-capture'].includes(permission)));
  });
}

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    rebuildOverlayWindows('second-instance');
    setOperationMode(true, 'second-instance');
  });
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) {
    return;
  }

  await loadSettings();
  configureSessionSecurity();
  createTray();
  createOverlayWindows();
  registerShortcuts();
  startActiveWindowTracking();

  screen.on('display-added', () => rebuildOverlayWindows('display-added'));
  screen.on('display-removed', () => rebuildOverlayWindows('display-removed'));
  screen.on('display-metrics-changed', () => rebuildOverlayWindows('display-metrics-changed'));

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
  stopTimerBroadcastInterval();
  stopActiveWindowTracking();
  globalShortcut.unregisterAll();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createOverlayWindows();
  }
});
