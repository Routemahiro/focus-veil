const body = document.body;
const canvas = document.querySelector('#veil-canvas');
const context = canvas.getContext('2d', { alpha: true });
const timerPanel = document.querySelector('.timer-panel');
const modeLabel = document.querySelector('#mode-label');
const timeReadout = document.querySelector('#time-readout');
const timerControls = document.querySelector('.timer-controls');
const settingsControls = document.querySelector('.settings-controls');
const operationDismiss = document.querySelector('.operation-dismiss');
const idleShortcutHint = document.querySelector('.idle-shortcut-hint');
const shortcutHint = document.querySelector('.shortcut-hint');
const updateDownloadBar = document.querySelector('.update-download-bar');
const updateDownloadFill = document.querySelector('.update-download-fill');
const manualUpdateControl = document.querySelector('[data-update-control]');
const manualUpdateButton = document.querySelector('[data-action="check-for-updates"]');
const manualUpdateNote = document.querySelector('[data-update-state]');
const releasesPrompt = document.querySelector('[data-releases-prompt]');
const releasesPromptText = document.querySelector('[data-releases-prompt-text]');
const openReleasesButton = document.querySelector('[data-action="open-releases"]');
const dismissReleasesButton = document.querySelector('[data-action="dismiss-releases"]');

const query = new URLSearchParams(window.location.search);
const isSmoke = query.get('smoke') === '1';
const isPreview = query.get('preview') === '1';
const hasControls = query.get('controls') !== '0';
const displayKey = query.get('display') || 'display-unknown';
const defaultSettings = {
  veilEnabled: true,
  rippleEnabled: true,
  autoUpdateEnabled: true,
  veilAlpha: 0.16,
  spotlightRadius: 245,
  spotlightSoftness: 0.68,
  workMinutes: 25,
  breakMinutes: 5
};
const durations = {
  work: isSmoke ? 4 : 25 * 60,
  break: isSmoke ? 2 : 5 * 60
};
const activeDrawInterval = 32;
const idleDrawInterval = 100;
const activeAfterInputMs = 1500;
const veilFadeMs = 560;

const state = {
  operationMode: false,
  controlHoldMode: false,
  mouseX: window.innerWidth / 2,
  mouseY: window.innerHeight / 2,
  spotX: window.innerWidth / 2,
  spotY: window.innerHeight / 2,
  isActiveDisplay: true,
  spotlightPresence: 1,
  spotlightTargetPresence: 1,
  lastMouseMoveAt: performance.now(),
  lastSpotUpdate: performance.now(),
  lastPresenceUpdate: performance.now(),
  activeWindowRect: null,
  activeWindowTargetRect: null,
  activeWindowPresence: 0,
  activeWindowTargetPresence: 0,
  lastActiveWindowUpdate: performance.now(),
  settings: { ...defaultSettings },
  phase: 'work',
  running: false,
  remaining: durations.work,
  veilPresence: 1,
  veilTargetPresence: 1,
  lastVeilPresenceUpdate: performance.now(),
  notificationUntil: 0,
  notificationCount: 0,
  lastNotificationCount: 0,
  nextRippleAt: performance.now() + 1800 + Math.random() * 1800,
  ripples: [],
  updateDownload: {
    transferring: false,
    percent: 0
  },
  updateControl: {
    supported: false,
    phase: 'idle',
    message: '',
    reason: null,
    offerReleasesPage: false
  },
  releasesPageOpened: false
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(current, target, blend) {
  return current + (target - current) * blend;
}

function sanitizeLocalRect(rect) {
  if (!rect) {
    return null;
  }

  const x = clamp(Number(rect.x), -24, window.innerWidth + 24);
  const y = clamp(Number(rect.y), -24, window.innerHeight + 24);
  const right = clamp(Number(rect.x) + Number(rect.width), -24, window.innerWidth + 24);
  const bottom = clamp(Number(rect.y) + Number(rect.height), -24, window.innerHeight + 24);
  const width = right - x;
  const height = bottom - y;

  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 32 || height < 32) {
    return null;
  }

  return { x, y, width, height };
}

function addRoundedRectPath(rect, radius) {
  const x = rect.x;
  const y = rect.y;
  const width = rect.width;
  const height = rect.height;
  const safeRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();

  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, width, height, safeRadius);
    return;
  }

  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
}

function resizeCanvas() {
  const scale = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(window.innerWidth * scale));
  const height = Math.max(1, Math.floor(window.innerHeight * scale));

  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  context.setTransform(scale, 0, 0, scale, 0, 0);
}

function setOperationMode(enabled) {
  state.operationMode = enabled;
  body.classList.toggle('operation-mode', enabled);
  requestActiveFrame(500);
}

function setActiveDisplay(active) {
  const nextActive = Boolean(active);
  const wasActive = state.isActiveDisplay;
  state.isActiveDisplay = nextActive;
  state.spotlightTargetPresence = nextActive ? 1 : 0;

  if (nextActive && !wasActive) {
    state.spotX = state.mouseX;
    state.spotY = state.mouseY;
    state.lastSpotUpdate = performance.now();
  }

  requestActiveFrame(520);
}

function applyActiveDisplayState(payload) {
  setActiveDisplay(payload?.activeDisplayKey === displayKey);
}

function setActiveWindowRect(rect) {
  const nextRect = sanitizeLocalRect(rect);
  state.activeWindowTargetRect = nextRect;
  state.activeWindowTargetPresence = nextRect ? 1 : 0;

  if (nextRect && !state.activeWindowRect) {
    state.activeWindowRect = { ...nextRect };
    state.activeWindowPresence = 0;
  }

  requestActiveFrame(520);
}

function getNotificationPulse(now) {
  if (now >= state.notificationUntil) {
    return 0;
  }

  const remaining = state.notificationUntil - now;
  const progress = 1 - remaining / 1600;
  return Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI);
}

function formatTime(seconds) {
  const clamped = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(clamped / 60);
  const remainingSeconds = clamped % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function addRipple(now, x, y, strength = 1) {
  if (!state.settings.rippleEnabled) {
    return;
  }

  state.ripples.push({
    x,
    y,
    start: now,
    duration: 5200 + Math.random() * 1600,
    maxRadius: 110 + Math.random() * 130,
    strength
  });

  if (state.ripples.length > 6) {
    state.ripples.shift();
  }
}

function updateRipples(width, height, now) {
  if (!state.settings.rippleEnabled) {
    state.ripples = [];
    return;
  }

  if (now >= state.nextRippleAt) {
    const marginX = width * 0.12;
    const marginY = height * 0.14;
    addRipple(
      now,
      marginX + Math.random() * Math.max(1, width - marginX * 2),
      marginY + Math.random() * Math.max(1, height - marginY * 2),
      0.78
    );
    state.nextRippleAt = now + 4200 + Math.random() * 4200;
  }

  state.ripples = state.ripples.filter((ripple) => now - ripple.start < ripple.duration);
}

function drawRippleField(width, height, now, pulse) {
  if (!state.settings.rippleEnabled) {
    state.ripples = [];
    return;
  }

  updateRipples(width, height, now);

  context.save();
  context.globalCompositeOperation = 'source-over';

  const drift = now * 0.00016;
  for (let row = height * 0.18; row < height; row += 150) {
    context.beginPath();
    for (let x = -60; x <= width + 60; x += 36) {
      const y =
        row +
        Math.sin(x * 0.01 + drift + row * 0.018) * 4 +
        Math.sin(x * 0.023 - drift * 0.8) * 2;
      if (x === -60) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    context.lineWidth = 1;
    context.strokeStyle = `rgba(148, 210, 202, ${(0.045 * state.veilPresence).toFixed(3)})`;
    context.stroke();
  }

  for (const ripple of state.ripples) {
    const age = now - ripple.start;
    const progress = Math.max(0, Math.min(1, age / ripple.duration));
    const eased = 1 - Math.pow(1 - progress, 2.2);
    const radius = ripple.maxRadius * eased;
    const alpha =
      (1 - progress) * (0.105 + pulse * 0.04) * ripple.strength * state.veilPresence;

    context.beginPath();
    context.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
    context.lineWidth = 1.2 + progress * 1.4;
    context.strokeStyle = `rgba(166, 226, 216, ${alpha.toFixed(3)})`;
    context.stroke();

    context.beginPath();
    context.arc(ripple.x, ripple.y, radius * 0.58, 0, Math.PI * 2);
    context.lineWidth = 0.8;
    context.strokeStyle = `rgba(238, 220, 168, ${(alpha * 0.42).toFixed(3)})`;
    context.stroke();
  }

  context.restore();
}

function buildSpotlightParams(pulse) {
  const softness = state.settings.spotlightSoftness;
  const radius =
    state.settings.spotlightRadius + (state.operationMode ? 36 : 0) + pulse * 86;
  const coreStop = clamp(0.15 + (1 - softness) * 0.17, 0.14, 0.32);
  const shoulderStop = clamp(0.46 + softness * 0.26, 0.52, 0.78);
  const centerClear = clamp(0.64 + state.settings.veilAlpha * 1.15, 0.66, 0.9);

  return {
    veilAlpha: Math.max(0.02, state.settings.veilAlpha - pulse * 0.055),
    radius,
    coreStop,
    shoulderStop,
    centerClear,
    shoulderClear: clamp(centerClear * (0.28 + softness * 0.18), 0.28, 0.46),
    glowRadius: radius * (0.84 + softness * 0.18),
    glowAlpha: 0.02 + pulse * 0.026
  };
}

function updateSpotPosition(now) {
  const elapsed = clamp(now - state.lastSpotUpdate, 1, 64);
  const distance = Math.hypot(state.mouseX - state.spotX, state.mouseY - state.spotY);
  const responseMs = now - state.lastMouseMoveAt < 180 ? 72 : 118;
  const blend = distance > 420 ? 1 : 1 - Math.exp(-elapsed / responseMs);

  state.spotX += (state.mouseX - state.spotX) * blend;
  state.spotY += (state.mouseY - state.spotY) * blend;

  if (distance < 0.35) {
    state.spotX = state.mouseX;
    state.spotY = state.mouseY;
  }

  state.lastSpotUpdate = now;
}

function updateSpotlightPresence(now) {
  const elapsed = clamp(now - state.lastPresenceUpdate, 1, 80);
  const blend = 1 - Math.exp(-elapsed / 95);

  state.spotlightPresence = lerp(
    state.spotlightPresence,
    state.spotlightTargetPresence,
    blend
  );

  if (Math.abs(state.spotlightPresence - state.spotlightTargetPresence) < 0.01) {
    state.spotlightPresence = state.spotlightTargetPresence;
  }

  state.lastPresenceUpdate = now;
}

function updateActiveWindowGlow(now) {
  const elapsed = clamp(now - state.lastActiveWindowUpdate, 1, 80);
  const blend = 1 - Math.exp(-elapsed / 115);

  state.activeWindowPresence = lerp(
    state.activeWindowPresence,
    state.activeWindowTargetPresence,
    blend
  );

  if (Math.abs(state.activeWindowPresence - state.activeWindowTargetPresence) < 0.01) {
    state.activeWindowPresence = state.activeWindowTargetPresence;
  }

  if (state.activeWindowTargetRect) {
    if (!state.activeWindowRect) {
      state.activeWindowRect = { ...state.activeWindowTargetRect };
    } else {
      state.activeWindowRect = {
        x: lerp(state.activeWindowRect.x, state.activeWindowTargetRect.x, blend),
        y: lerp(state.activeWindowRect.y, state.activeWindowTargetRect.y, blend),
        width: lerp(state.activeWindowRect.width, state.activeWindowTargetRect.width, blend),
        height: lerp(state.activeWindowRect.height, state.activeWindowTargetRect.height, blend)
      };
    }
  } else if (state.activeWindowPresence <= 0.01) {
    state.activeWindowPresence = 0;
    state.activeWindowRect = null;
  }

  state.lastActiveWindowUpdate = now;
}

function getVeilTargetPresence() {
  if (!state.settings.veilEnabled) {
    return 0;
  }

  return state.phase === 'work' ? 1 : 0;
}

function syncVeilTargetPresence({ snap = false } = {}) {
  state.veilTargetPresence = getVeilTargetPresence();

  if (snap) {
    state.veilPresence = state.veilTargetPresence;
    state.lastVeilPresenceUpdate = performance.now();
  }
}

function updateVeilPresence(now) {
  const elapsed = clamp(now - state.lastVeilPresenceUpdate, 1, 80);
  const blend = 1 - Math.exp(-elapsed / veilFadeMs);

  state.veilPresence = lerp(state.veilPresence, state.veilTargetPresence, blend);

  if (Math.abs(state.veilPresence - state.veilTargetPresence) < 0.008) {
    state.veilPresence = state.veilTargetPresence;
  }

  state.lastVeilPresenceUpdate = now;
}

function updateFocusGeometry(now) {
  updateSpotPosition(now);
  updateSpotlightPresence(now);
  updateActiveWindowGlow(now);
  updateVeilPresence(now);
}

function drawActiveWindowGlow() {
  if (!state.activeWindowRect || state.activeWindowPresence <= 0.01) {
    return;
  }

  const presence = state.activeWindowPresence * state.veilPresence;
  const rect = {
    x: state.activeWindowRect.x,
    y: state.activeWindowRect.y,
    width: state.activeWindowRect.width,
    height: state.activeWindowRect.height
  };
  const radius = clamp(Math.min(rect.width, rect.height) * 0.035, 10, 22);
  const clearAlpha = clamp(0.07 + state.settings.veilAlpha * 0.34, 0.08, 0.17) * presence;
  const edgeAlpha = clearAlpha * 0.5;

  context.save();
  context.globalCompositeOperation = 'destination-out';
  context.shadowColor = `rgba(0, 0, 0, ${edgeAlpha.toFixed(3)})`;
  context.shadowBlur = 42;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.fillStyle = `rgba(0, 0, 0, ${clearAlpha.toFixed(3)})`;
  addRoundedRectPath(rect, radius);
  context.fill();
  context.restore();

  context.save();
  context.globalCompositeOperation = 'source-over';
  context.shadowColor = `rgba(177, 226, 214, ${(0.018 * presence).toFixed(3)})`;
  context.shadowBlur = 34;
  context.strokeStyle = `rgba(214, 240, 232, ${(0.012 * presence).toFixed(3)})`;
  context.lineWidth = 1;
  addRoundedRectPath(rect, radius);
  context.stroke();
  context.restore();
}

function drawVeil(now = performance.now()) {
  const width = window.innerWidth;
  const height = window.innerHeight;

  if (!state.settings.veilEnabled || state.veilPresence <= 0.01) {
    context.clearRect(0, 0, width, height);
    return;
  }

  const pulse = getNotificationPulse(now);
  const spotlight = buildSpotlightParams(pulse);
  const veilPresence = state.veilPresence;

  context.clearRect(0, 0, width, height);

  context.fillStyle = `rgba(0, 0, 0, ${(spotlight.veilAlpha * veilPresence).toFixed(3)})`;
  context.fillRect(0, 0, width, height);

  drawActiveWindowGlow();

  const spotlightPresence = state.spotlightPresence * veilPresence;
  if (spotlightPresence > 0.01) {
    const gradient = context.createRadialGradient(
      state.spotX,
      state.spotY,
      20,
      state.spotX,
      state.spotY,
      spotlight.radius
    );
    gradient.addColorStop(
      0,
      `rgba(0, 0, 0, ${(spotlight.centerClear * spotlightPresence).toFixed(3)})`
    );
    gradient.addColorStop(
      spotlight.coreStop,
      `rgba(0, 0, 0, ${(spotlight.centerClear * 0.92 * spotlightPresence).toFixed(3)})`
    );
    gradient.addColorStop(
      spotlight.shoulderStop,
      `rgba(0, 0, 0, ${(spotlight.shoulderClear * spotlightPresence).toFixed(3)})`
    );
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    context.globalCompositeOperation = 'destination-out';
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(state.spotX, state.spotY, spotlight.radius, 0, Math.PI * 2);
    context.fill();
    context.globalCompositeOperation = 'source-over';

    const glow = context.createRadialGradient(
      state.spotX,
      state.spotY,
      0,
      state.spotX,
      state.spotY,
      spotlight.glowRadius
    );
    glow.addColorStop(
      0,
      `rgba(226, 248, 241, ${(spotlight.glowAlpha * spotlightPresence).toFixed(3)})`
    );
    glow.addColorStop(0.58, `rgba(186, 226, 216, ${(0.014 * spotlightPresence).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(186, 226, 216, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(state.spotX, state.spotY, spotlight.glowRadius, 0, Math.PI * 2);
    context.fill();
  }

  if (state.settings.rippleEnabled) {
    drawRippleField(width, height, now, pulse);
  }
}

let lastDraw = 0;
let animationFrameId = null;
let animationTimeoutId = null;
let forceActiveUntil = 0;
let lastCursorActivitySentAt = 0;

function clearVeilCanvas() {
  context.clearRect(0, 0, window.innerWidth, window.innerHeight);
  lastDraw = performance.now();
}

function isActiveAnimationState(now) {
  if (!state.settings.veilEnabled) {
    return false;
  }

  const spotDistance = Math.hypot(state.mouseX - state.spotX, state.mouseY - state.spotY);
  const spotlightTransition =
    Math.abs(state.spotlightPresence - state.spotlightTargetPresence) > 0.01;
  const activeWindowDistance =
    state.activeWindowTargetRect && state.activeWindowRect
      ? Math.hypot(
          state.activeWindowTargetRect.x - state.activeWindowRect.x,
          state.activeWindowTargetRect.y - state.activeWindowRect.y,
          state.activeWindowTargetRect.width - state.activeWindowRect.width,
          state.activeWindowTargetRect.height - state.activeWindowRect.height
        )
      : 0;
  const windowTransition =
    Math.abs(state.activeWindowPresence - state.activeWindowTargetPresence) > 0.01 ||
    activeWindowDistance > 0.5;
  const veilTransition = Math.abs(state.veilPresence - state.veilTargetPresence) > 0.008;

  return (
    now - state.lastMouseMoveAt < activeAfterInputMs ||
    spotDistance > 0.5 ||
    spotlightTransition ||
    windowTransition ||
    veilTransition ||
    now < state.notificationUntil ||
    now < forceActiveUntil ||
    state.operationMode
  );
}

function cancelAnimationSchedule() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (animationTimeoutId !== null) {
    clearTimeout(animationTimeoutId);
    animationTimeoutId = null;
  }
}

function scheduleAnimationLoop(active = false) {
  if (!state.settings.veilEnabled || animationFrameId !== null || animationTimeoutId !== null) {
    return;
  }

  if (active) {
    animationFrameId = requestAnimationFrame(animationLoop);
    return;
  }

  animationTimeoutId = setTimeout(() => {
    animationTimeoutId = null;
    animationFrameId = requestAnimationFrame(animationLoop);
  }, idleDrawInterval);
}

function requestActiveFrame(duration = 250) {
  forceActiveUntil = Math.max(forceActiveUntil, performance.now() + duration);

  if (!state.settings.veilEnabled) {
    return;
  }

  if (animationTimeoutId !== null) {
    clearTimeout(animationTimeoutId);
    animationTimeoutId = null;
  }

  scheduleAnimationLoop(true);
}

function notifyCursorActivity(now = performance.now()) {
  const shouldSend = !state.isActiveDisplay || now - lastCursorActivitySentAt > 200;

  if (!shouldSend) {
    return;
  }

  lastCursorActivitySentAt = now;
  window.focusVeil?.notifyCursorActivity?.();
}

function startAnimationLoop(active = true) {
  if (!state.settings.veilEnabled) {
    return;
  }

  scheduleAnimationLoop(active);
}

function animationLoop(now) {
  animationFrameId = null;

  if (!state.settings.veilEnabled) {
    clearVeilCanvas();
    return;
  }

  updateFocusGeometry(now);

  const active = isActiveAnimationState(now);
  const drawInterval = active ? activeDrawInterval : idleDrawInterval;

  if (now - lastDraw >= drawInterval) {
    drawVeil(now);
    lastDraw = now;
  }

  scheduleAnimationLoop(active);
}

function requestOperationMode(enabled) {
  setOperationMode(enabled);
  window.focusVeil?.setOperationMode(enabled).catch(() => {
    setOperationMode(!enabled);
  });
}

function updateTimerUi() {
  modeLabel.textContent = state.phase === 'work' ? 'Focus' : 'Break';
  timerPanel.dataset.mode = state.phase;
  timeReadout.textContent = formatTime(state.remaining);
  body.classList.toggle('timer-running', state.running);
}

function triggerNotification() {
  state.notificationUntil = performance.now() + 1600;
  const now = performance.now();
  addRipple(now, state.spotX, state.spotY, 1.15);
  requestActiveFrame(1700);
}

function applyTimerState(timerState) {
  if (!timerState) {
    return;
  }

  const previousPhase = state.phase;
  state.phase = timerState.phase;
  state.running = timerState.running;
  state.remaining = timerState.remaining;
  state.notificationCount = timerState.notificationCount;
  syncVeilTargetPresence();

  if (state.notificationCount > state.lastNotificationCount) {
    state.lastNotificationCount = state.notificationCount;
    triggerNotification();
  }

  updateTimerUi();
  requestActiveFrame(previousPhase === state.phase ? 90 : 2000);
}

function normalizeSettings(candidate = {}) {
  return {
    veilEnabled:
      typeof candidate.veilEnabled === 'boolean'
        ? candidate.veilEnabled
        : defaultSettings.veilEnabled,
    rippleEnabled:
      typeof candidate.rippleEnabled === 'boolean'
        ? candidate.rippleEnabled
        : defaultSettings.rippleEnabled,
    autoUpdateEnabled:
      typeof candidate.autoUpdateEnabled === 'boolean'
        ? candidate.autoUpdateEnabled
        : defaultSettings.autoUpdateEnabled,
    veilAlpha: clamp(Number(candidate.veilAlpha) || defaultSettings.veilAlpha, 0.04, 0.3),
    spotlightRadius: Math.round(
      clamp(Number(candidate.spotlightRadius) || defaultSettings.spotlightRadius, 140, 360)
    ),
    spotlightSoftness: Number(
      clamp(
        Number(candidate.spotlightSoftness) || defaultSettings.spotlightSoftness,
        0.35,
        0.9
      ).toFixed(2)
    ),
    workMinutes: Math.round(
      clamp(Number(candidate.workMinutes) || defaultSettings.workMinutes, 1, 180)
    ),
    breakMinutes: Math.round(
      clamp(Number(candidate.breakMinutes) || defaultSettings.breakMinutes, 1, 60)
    )
  };
}

function syncSettingsControls() {
  if (!settingsControls) {
    return;
  }

  for (const control of settingsControls.querySelectorAll('[data-setting]')) {
    const value = state.settings[control.dataset.setting];
    if (control.type === 'checkbox') {
      control.checked = Boolean(value);
    } else {
      control.value = String(value);
    }
  }
}

function applyUpdateDownload(progress = {}) {
  const transferring = Boolean(progress.transferring);
  const percent = transferring
    ? Math.max(0, Math.min(100, Number(progress.percent) || 0))
    : 0;

  state.updateDownload = {
    transferring,
    percent
  };

  if (!updateDownloadBar || !updateDownloadFill) {
    return;
  }

  updateDownloadBar.hidden = !transferring;
  updateDownloadBar.setAttribute('aria-hidden', transferring ? 'false' : 'true');
  updateDownloadBar.setAttribute('aria-valuenow', String(Math.round(percent)));
  updateDownloadFill.style.width = transferring ? `${percent}%` : '0%';
}

function applyUpdateStatus(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return;
  }

  if (payload.transferring != null) {
    applyUpdateDownload(payload);
  }

  if (payload.phase == null && payload.supported == null && payload.message == null) {
    return;
  }

  state.updateControl = {
    supported: Boolean(payload.supported),
    phase: typeof payload.phase === 'string' ? payload.phase : 'idle',
    message: typeof payload.message === 'string' ? payload.message : '',
    reason: payload.reason || null,
    offerReleasesPage: payload.offerReleasesPage === true
  };

  if (!manualUpdateButton || !manualUpdateNote) {
    return;
  }

  const control = state.updateControl;
  const busy = control.phase === 'checking' || control.phase === 'downloading';
  manualUpdateButton.disabled = control.supported ? busy : false;
  manualUpdateButton.textContent =
    control.phase === 'checking'
      ? 'Checking…'
      : control.phase === 'downloading'
        ? 'Downloading…'
        : 'Check for updates';

  const note = control.message.trim();
  manualUpdateNote.hidden = note.length === 0;
  manualUpdateNote.textContent = note;

  if (releasesPrompt) {
    releasesPrompt.hidden = !control.offerReleasesPage;
  }
}

function applySettings(settingsPatch = {}) {
  const nextSettings = normalizeSettings({
    ...state.settings,
    ...settingsPatch
  });
  const veilWasEnabled = state.settings.veilEnabled;
  state.settings = nextSettings;
  body.classList.toggle('overlay-disabled', !state.settings.veilEnabled);
  syncSettingsControls();
  syncVeilTargetPresence({ snap: veilWasEnabled !== state.settings.veilEnabled });

  if (!state.settings.rippleEnabled) {
    state.ripples = [];
  }

  if (!state.settings.veilEnabled) {
    cancelAnimationSchedule();
    clearVeilCanvas();
    return;
  }

  if (!veilWasEnabled) {
    lastDraw = 0;
    startAnimationLoop(true);
  }

  requestActiveFrame(500);
}

let settingsUpdateTimer = null;
let pendingSettingsPatch = {};

function requestSettingsUpdate(patch) {
  applySettings(patch);
  pendingSettingsPatch = {
    ...pendingSettingsPatch,
    ...patch
  };
  clearTimeout(settingsUpdateTimer);
  settingsUpdateTimer = setTimeout(() => {
    const nextPatch = pendingSettingsPatch;
    pendingSettingsPatch = {};
    window.focusVeil?.updateSettings(nextPatch).catch(() => {
      window.focusVeil?.getMainState().then((mainState) => {
        applySettings(mainState.settings);
      });
    });
  }, 120);
}

function getPublicState() {
  return {
    operationMode: state.operationMode,
    displayKey,
    isActiveDisplay: state.isActiveDisplay,
    spotlightPresence: Number(state.spotlightPresence.toFixed(3)),
    mouseX: Number(state.mouseX.toFixed(1)),
    mouseY: Number(state.mouseY.toFixed(1)),
    spotX: Number(state.spotX.toFixed(1)),
    spotY: Number(state.spotY.toFixed(1)),
    activeWindowPresence: Number(state.activeWindowPresence.toFixed(3)),
    activeWindowRect: state.activeWindowRect
      ? {
          x: Number(state.activeWindowRect.x.toFixed(1)),
          y: Number(state.activeWindowRect.y.toFixed(1)),
          width: Number(state.activeWindowRect.width.toFixed(1)),
          height: Number(state.activeWindowRect.height.toFixed(1))
        }
      : null,
    motionHighlightCount: 0,
    rippleCount: state.ripples.length,
    phase: state.phase,
    running: state.running,
    remaining: Number(state.remaining.toFixed(2)),
    timeText: timeReadout.textContent,
    notificationCount: state.notificationCount,
    veilPresence: Number(state.veilPresence.toFixed(3)),
    veilTargetPresence: Number(state.veilTargetPresence.toFixed(3)),
    settings: { ...state.settings },
    controlsVisible: hasControls && getComputedStyle(timerControls).display !== 'none',
    idleShortcutHint: idleShortcutHint?.textContent || '',
    idleShortcutHintVisible:
      hasControls &&
      idleShortcutHint != null &&
      getComputedStyle(idleShortcutHint).display !== 'none',
    shortcutHint: shortcutHint?.textContent || '',
    shortcutHintVisible:
      hasControls && shortcutHint != null && getComputedStyle(shortcutHint).display !== 'none',
    updateDownloadTransferring: state.updateDownload.transferring,
    updateDownloadPercent: Number(state.updateDownload.percent.toFixed(1)),
    updateDownloadBarVisible:
      hasControls &&
      updateDownloadBar != null &&
      !updateDownloadBar.hidden &&
      getComputedStyle(updateDownloadBar).display !== 'none',
    timerPanelWidth: timerPanel ? Number(timerPanel.getBoundingClientRect().width.toFixed(1)) : 0,
    manualUpdateText: manualUpdateButton?.textContent?.trim() || '',
    manualUpdateDisabled: Boolean(manualUpdateButton?.disabled),
    manualUpdateNote: manualUpdateNote?.textContent?.trim() || '',
    manualUpdateNoteVisible:
      hasControls && manualUpdateNote != null && !manualUpdateNote.hidden,
    manualUpdateUnderAuto:
      document.querySelector('[data-setting="autoUpdateEnabled"]')?.closest('label')
        ?.nextElementSibling === manualUpdateControl,
    releasesPromptVisible:
      hasControls && releasesPrompt != null && !releasesPrompt.hidden,
    releasesPromptText: releasesPromptText?.textContent?.trim() || '',
    releasesPromptHasYes: openReleasesButton != null,
    releasesPromptHasNo: dismissReleasesButton != null,
    releasesPageOpened: state.releasesPageOpened === true
  };
}

operationDismiss?.addEventListener('click', () => {
  if (!state.operationMode) {
    return;
  }

  state.controlHoldMode = false;
  requestOperationMode(false);
});

timerControls.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  try {
    applyTimerState(await window.focusVeil?.timerCommand(button.dataset.action));
  } catch {
    updateTimerUi();
  }
});

settingsControls?.addEventListener('input', (event) => {
  const control = event.target.closest('[data-setting]');
  if (!control || control.type === 'number' || control.type === 'checkbox') {
    return;
  }

  const key = control.dataset.setting;
  const value = control.type === 'checkbox' ? control.checked : Number(control.value);
  requestSettingsUpdate({ [key]: value });
});

manualUpdateButton?.addEventListener('click', async () => {
  try {
    applyUpdateStatus(await window.focusVeil?.checkForUpdates());
  } catch {
    applyUpdateStatus({
      supported: state.updateControl.supported,
      phase: 'error',
      message: 'Update check failed.',
      offerReleasesPage: false
    });
  }
});

openReleasesButton?.addEventListener('click', async () => {
  try {
    const result = await window.focusVeil?.openReleasesPage();
    state.releasesPageOpened = result?.opened === true;
    applyUpdateStatus(result?.updateControl);
  } catch {
    state.releasesPageOpened = false;
  }
});

dismissReleasesButton?.addEventListener('click', async () => {
  try {
    applyUpdateStatus(await window.focusVeil?.dismissReleasesPrompt());
  } catch {
    applyUpdateStatus({
      ...state.updateControl,
      offerReleasesPage: false
    });
  }
});

settingsControls?.addEventListener('change', (event) => {
  const control = event.target.closest('[data-setting]');
  if (!control) {
    return;
  }

  const key = control.dataset.setting;
  const value = control.type === 'checkbox' ? control.checked : Number(control.value);
  requestSettingsUpdate({ [key]: value });
});

window.addEventListener('resize', () => {
  resizeCanvas();
  state.activeWindowTargetRect = sanitizeLocalRect(state.activeWindowTargetRect);
  state.activeWindowRect = sanitizeLocalRect(state.activeWindowRect);
  state.activeWindowTargetPresence = state.activeWindowTargetRect ? 1 : 0;
  lastDraw = 0;
  requestActiveFrame(500);
});

window.addEventListener('mousemove', (event) => {
  const now = performance.now();
  state.mouseX = event.clientX;
  state.mouseY = event.clientY;
  state.lastMouseMoveAt = now;
  notifyCursorActivity(now);
  requestActiveFrame(activeAfterInputMs);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Control' && !state.operationMode) {
    state.controlHoldMode = true;
    requestOperationMode(true);
  }

  if (event.key === 'Escape' && state.operationMode) {
    state.controlHoldMode = false;
    requestOperationMode(false);
  }
});

window.addEventListener('keyup', (event) => {
  if (event.key === 'Control' && state.controlHoldMode) {
    state.controlHoldMode = false;
    requestOperationMode(false);
  }
});

window.focusVeil?.onOperationModeChanged(({ enabled }) => {
  setOperationMode(enabled);
});

window.focusVeil?.onTimerStateChanged((timerState) => {
  applyTimerState(timerState);
});

window.focusVeil?.onSettingsChanged((payload) => {
  applySettings(payload?.settings);
});

window.focusVeil?.onActiveDisplayChanged((payload) => {
  applyActiveDisplayState(payload);
});

window.focusVeil?.onActiveWindowChanged((payload) => {
  setActiveWindowRect(payload?.rect);
});

window.focusVeil?.onUpdateDownloadChanged((payload) => {
  applyUpdateStatus(payload);
});

window.focusVeil?.getMainState().then((mainState) => {
  applySettings(mainState.settings);
  applyTimerState(mainState.timer);
  applyActiveDisplayState({ activeDisplayKey: mainState.activeDisplayKey });
  applyUpdateStatus(mainState.updateControl || mainState.updateDownload);
});

if (isPreview) {
  body.classList.add('preview-mode');
}

if (!hasControls) {
  body.classList.add('overlay-only');
}

if (isSmoke) {
  window.focusVeilSmoke = {
    async click(action) {
      applyTimerState(await window.focusVeil?.timerCommand(action));
      return getPublicState();
    },
    getState: getPublicState,
    setMouse(x, y) {
      state.mouseX = x;
      state.mouseY = y;
      state.spotX = x;
      state.spotY = y;
      state.lastMouseMoveAt = performance.now();
      requestActiveFrame(500);
      return getPublicState();
    },
    setActiveDisplay(active) {
      setActiveDisplay(Boolean(active));
      return getPublicState();
    },
    setActiveWindowRect(rect) {
      setActiveWindowRect(rect);
      return getPublicState();
    },
    async setOperationMode(enabled) {
      setOperationMode(Boolean(enabled));
      await window.focusVeil?.setOperationMode(Boolean(enabled));
      return getPublicState();
    },
    async dismissOperationMenu() {
      operationDismiss?.click();
      return getPublicState();
    },
    triggerNotification() {
      triggerNotification();
      return getPublicState();
    },
    async setSettings(patch) {
      applySettings(patch);
      await window.focusVeil?.updateSettings(patch);
      return getPublicState();
    },
    async setUpdateDownloadProgress(progress) {
      applyUpdateDownload(await window.focusVeil?.debugSetUpdateDownload(progress));
      return getPublicState();
    },
    async checkForUpdates() {
      applyUpdateStatus(await window.focusVeil?.checkForUpdates());
      return getPublicState();
    },
    async dismissReleasesPrompt() {
      applyUpdateStatus(await window.focusVeil?.dismissReleasesPrompt());
      return getPublicState();
    }
  };
}

resizeCanvas();
updateTimerUi();
syncSettingsControls();
startAnimationLoop(true);
