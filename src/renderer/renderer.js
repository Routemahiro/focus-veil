const body = document.body;
const canvas = document.querySelector('#veil-canvas');
const context = canvas.getContext('2d', { alpha: true });
const timerPanel = document.querySelector('.timer-panel');
const modeLabel = document.querySelector('#mode-label');
const timeReadout = document.querySelector('#time-readout');
const timerControls = document.querySelector('.timer-controls');
const settingsControls = document.querySelector('.settings-controls');

const query = new URLSearchParams(window.location.search);
const isSmoke = query.get('smoke') === '1';
const isPreview = query.get('preview') === '1';
const hasControls = query.get('controls') !== '0';
const initialMotionEnabled = query.get('motion') !== '0';
const motionFocusEnabled = true;
const defaultSettings = {
  veilEnabled: true,
  motionEnabled: initialMotionEnabled,
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
const motionSampleInterval = 320;

const state = {
  operationMode: false,
  controlHoldMode: false,
  mouseX: window.innerWidth / 2,
  mouseY: window.innerHeight / 2,
  spotX: window.innerWidth / 2,
  spotY: window.innerHeight / 2,
  lastMouseMoveAt: performance.now(),
  lastSpotUpdate: performance.now(),
  motionHighlights: [],
  motionStatus: initialMotionEnabled ? 'starting' : 'disabled',
  settings: { ...defaultSettings },
  phase: 'work',
  running: false,
  remaining: durations.work,
  notificationUntil: 0,
  notificationCount: 0,
  lastNotificationCount: 0,
  nextRippleAt: performance.now() + 1800 + Math.random() * 1800,
  ripples: []
};

const motionCapture = {
  enabled: initialMotionEnabled,
  available: false,
  stream: null,
  video: null,
  canvas: document.createElement('canvas'),
  context: null,
  previousFrame: null,
  lastSample: 0,
  sampleWidth: 128,
  sampleHeight: 72
};

motionCapture.canvas.width = motionCapture.sampleWidth;
motionCapture.canvas.height = motionCapture.sampleHeight;
motionCapture.context = motionCapture.canvas.getContext('2d', {
  willReadFrequently: true
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
    context.strokeStyle = 'rgba(148, 210, 202, 0.045)';
    context.stroke();
  }

  for (const ripple of state.ripples) {
    const age = now - ripple.start;
    const progress = Math.max(0, Math.min(1, age / ripple.duration));
    const eased = 1 - Math.pow(1 - progress, 2.2);
    const radius = ripple.maxRadius * eased;
    const alpha = (1 - progress) * (0.105 + pulse * 0.04) * ripple.strength;

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

function drawMotionHighlights(now) {
  state.motionHighlights = state.motionHighlights.filter((highlight) => {
    const age = now - highlight.updatedAt;
    return age < 1800 && highlight.strength > 0.035;
  });

  if (state.motionHighlights.length === 0) {
    return;
  }

  const mouseIdleFactor = clamp((now - state.lastMouseMoveAt - 450) / 900, 0.58, 1);
  const visibleHighlights = state.motionHighlights.slice(0, 3);

  context.save();
  context.globalCompositeOperation = 'destination-out';

  for (const highlight of visibleHighlights) {
    const alpha = getMotionEnvelope(highlight, now) * highlight.strength * mouseIdleFactor;
    const radius = 150 + highlight.strength * 120;
    const reveal = context.createRadialGradient(
      highlight.x,
      highlight.y,
      0,
      highlight.x,
      highlight.y,
      radius
    );
    reveal.addColorStop(0, `rgba(0, 0, 0, ${(alpha * 0.16).toFixed(3)})`);
    reveal.addColorStop(0.42, `rgba(0, 0, 0, ${(alpha * 0.08).toFixed(3)})`);
    reveal.addColorStop(1, 'rgba(0, 0, 0, 0)');

    context.fillStyle = reveal;
    context.beginPath();
    context.arc(highlight.x, highlight.y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.globalCompositeOperation = 'source-over';

  for (const highlight of visibleHighlights) {
    const alpha = getMotionEnvelope(highlight, now) * highlight.strength * mouseIdleFactor;
    const coreRadius = 58 + highlight.strength * 46;
    const haloRadius = 180 + highlight.strength * 105;
    const halo = context.createRadialGradient(
      highlight.x,
      highlight.y,
      0,
      highlight.x,
      highlight.y,
      haloRadius
    );
    halo.addColorStop(0, `rgba(226, 252, 244, ${(alpha * 0.095).toFixed(3)})`);
    halo.addColorStop(0.32, `rgba(172, 224, 213, ${(alpha * 0.042).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(172, 224, 213, 0)');

    context.fillStyle = halo;
    context.beginPath();
    context.arc(highlight.x, highlight.y, haloRadius, 0, Math.PI * 2);
    context.fill();

    const core = context.createRadialGradient(
      highlight.x,
      highlight.y,
      0,
      highlight.x,
      highlight.y,
      coreRadius
    );
    core.addColorStop(0, `rgba(246, 255, 249, ${(alpha * 0.09).toFixed(3)})`);
    core.addColorStop(1, 'rgba(246, 255, 249, 0)');

    context.fillStyle = core;
    context.beginPath();
    context.arc(highlight.x, highlight.y, coreRadius, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function getMotionEnvelope(highlight, now) {
  const sinceCreated = now - (highlight.createdAt ?? highlight.updatedAt);
  const sinceUpdated = now - highlight.updatedAt;
  const attack = clamp(sinceCreated / 120, 0, 1);

  if (sinceUpdated < 340) {
    return attack;
  }

  return attack * clamp(1 - (sinceUpdated - 340) / 1150, 0, 1);
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

function drawVeil(now = performance.now()) {
  const width = window.innerWidth;
  const height = window.innerHeight;

  if (!state.settings.veilEnabled) {
    context.clearRect(0, 0, width, height);
    return;
  }

  const pulse = getNotificationPulse(now);
  const spotlight = buildSpotlightParams(pulse);

  context.clearRect(0, 0, width, height);

  context.fillStyle = `rgba(0, 0, 0, ${spotlight.veilAlpha.toFixed(3)})`;
  context.fillRect(0, 0, width, height);

  const gradient = context.createRadialGradient(
    state.spotX,
    state.spotY,
    20,
    state.spotX,
    state.spotY,
    spotlight.radius
  );
  gradient.addColorStop(0, `rgba(0, 0, 0, ${spotlight.centerClear.toFixed(3)})`);
  gradient.addColorStop(
    spotlight.coreStop,
    `rgba(0, 0, 0, ${(spotlight.centerClear * 0.92).toFixed(3)})`
  );
  gradient.addColorStop(
    spotlight.shoulderStop,
    `rgba(0, 0, 0, ${spotlight.shoulderClear.toFixed(3)})`
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
    `rgba(226, 248, 241, ${spotlight.glowAlpha.toFixed(3)})`
  );
  glow.addColorStop(0.58, 'rgba(186, 226, 216, 0.014)');
  glow.addColorStop(1, 'rgba(186, 226, 216, 0)');
  context.fillStyle = glow;
  context.beginPath();
  context.arc(state.spotX, state.spotY, spotlight.glowRadius, 0, Math.PI * 2);
  context.fill();

  drawMotionHighlights(now);
  drawRippleField(width, height, now, pulse);
}

let lastDraw = 0;
let animationFrameId = null;
let animationTimeoutId = null;
let forceActiveUntil = 0;

function clearVeilCanvas() {
  context.clearRect(0, 0, window.innerWidth, window.innerHeight);
  lastDraw = performance.now();
}

function hasVisibleMotionHighlight(now) {
  return state.motionHighlights.some((highlight) => {
    const age = now - highlight.updatedAt;
    return age < 1800 && highlight.strength > 0.035;
  });
}

function isActiveAnimationState(now) {
  if (!state.settings.veilEnabled) {
    return false;
  }

  const spotDistance = Math.hypot(state.mouseX - state.spotX, state.mouseY - state.spotY);

  return (
    now - state.lastMouseMoveAt < activeAfterInputMs ||
    spotDistance > 0.5 ||
    hasVisibleMotionHighlight(now) ||
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

  updateSpotPosition(now);
  sampleMotionFocus(now);

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

  state.phase = timerState.phase;
  state.running = timerState.running;
  state.remaining = timerState.remaining;
  state.notificationCount = timerState.notificationCount;

  if (state.notificationCount > state.lastNotificationCount) {
    state.lastNotificationCount = state.notificationCount;
    triggerNotification();
  }

  updateTimerUi();
  requestActiveFrame(90);
}

function normalizeSettings(candidate = {}) {
  return {
    veilEnabled:
      typeof candidate.veilEnabled === 'boolean'
        ? candidate.veilEnabled
        : defaultSettings.veilEnabled,
    motionEnabled:
      typeof candidate.motionEnabled === 'boolean'
        ? candidate.motionEnabled
        : defaultSettings.motionEnabled,
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

function applySettings(settingsPatch = {}) {
  const nextSettings = normalizeSettings({
    ...state.settings,
    ...settingsPatch
  });
  const motionWasEnabled = state.settings.motionEnabled;
  const veilWasEnabled = state.settings.veilEnabled;
  state.settings = nextSettings;
  body.classList.toggle('overlay-disabled', !state.settings.veilEnabled);
  syncSettingsControls();

  if (!state.settings.veilEnabled) {
    state.motionHighlights = [];
    motionCapture.enabled = false;
    state.motionStatus = state.settings.motionEnabled ? 'paused' : 'disabled';
    stopMotionCapture();
    cancelAnimationSchedule();
    clearVeilCanvas();
    return;
  }

  if (!veilWasEnabled) {
    lastDraw = 0;
    startAnimationLoop(true);
  }

  if (!state.settings.motionEnabled) {
    motionCapture.enabled = false;
    state.motionHighlights = [];
    state.motionStatus = 'disabled';
    stopMotionCapture();
    requestActiveFrame(500);
    return;
  }

  motionCapture.enabled = motionFocusEnabled;
  if (!motionFocusEnabled) {
    state.motionStatus = 'disabled';
    requestActiveFrame(500);
    return;
  }

  if (!motionWasEnabled || !motionCapture.stream) {
    startMotionCapture();
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
  const strongestHighlight = state.motionHighlights.reduce(
    (strongest, highlight) => (highlight.strength > strongest.strength ? highlight : strongest),
    { x: 0, y: 0, strength: 0 }
  );

  return {
    operationMode: state.operationMode,
    mouseX: Number(state.mouseX.toFixed(1)),
    mouseY: Number(state.mouseY.toFixed(1)),
    spotX: Number(state.spotX.toFixed(1)),
    spotY: Number(state.spotY.toFixed(1)),
    motionStatus: state.motionStatus,
    motionHighlightCount: state.motionHighlights.length,
    motionStrongestX: Number(strongestHighlight.x.toFixed(1)),
    motionStrongestY: Number(strongestHighlight.y.toFixed(1)),
    motionStrongestStrength: Number(strongestHighlight.strength.toFixed(3)),
    phase: state.phase,
    running: state.running,
    remaining: Number(state.remaining.toFixed(2)),
    timeText: timeReadout.textContent,
    notificationCount: state.notificationCount,
    settings: { ...state.settings },
    controlsVisible: hasControls && getComputedStyle(timerControls).display !== 'none'
  };
}

function updateMotionHighlights(points, now = performance.now()) {
  for (const point of points) {
    const x = clamp(point.x, 0, window.innerWidth);
    const y = clamp(point.y, 0, window.innerHeight);
    const strength = clamp(point.strength, 0, 1);
    let nearest = null;
    let nearestDistance = Infinity;

    for (const highlight of state.motionHighlights) {
      const distance = Math.hypot(highlight.x - x, highlight.y - y);
      if (distance < nearestDistance) {
        nearest = highlight;
        nearestDistance = distance;
      }
    }

    if (nearest && nearestDistance < 170) {
      nearest.x += (x - nearest.x) * 0.35;
      nearest.y += (y - nearest.y) * 0.35;
      nearest.strength = Math.max(nearest.strength, strength);
      nearest.updatedAt = now;
    } else {
      state.motionHighlights.push({ x, y, strength, createdAt: now, updatedAt: now });
    }
  }

  state.motionHighlights.sort((a, b) => b.strength - a.strength);
  state.motionHighlights = state.motionHighlights.slice(0, 3);
  requestActiveFrame(650);
}

function sampleMotionFocus(now) {
  if (
    !state.settings.veilEnabled ||
    !motionCapture.enabled ||
    !motionCapture.available ||
    !motionCapture.video ||
    now - motionCapture.lastSample < motionSampleInterval
  ) {
    return;
  }

  if (motionCapture.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }

  motionCapture.lastSample = now;
  const sampleWidth = motionCapture.sampleWidth;
  const sampleHeight = motionCapture.sampleHeight;
  const sampleContext = motionCapture.context;
  sampleContext.drawImage(motionCapture.video, 0, 0, sampleWidth, sampleHeight);

  const frame = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight);
  const current = frame.data;

  if (!motionCapture.previousFrame) {
    motionCapture.previousFrame = new Uint8ClampedArray(current);
    return;
  }

  const previous = motionCapture.previousFrame;
  let totalWeight = 0;
  let activePixels = 0;
  const cellColumns = 8;
  const cellRows = 6;
  const cellWeights = Array.from({ length: cellColumns * cellRows }, () => 0);
  const cellWeightedX = Array.from({ length: cellColumns * cellRows }, () => 0);
  const cellWeightedY = Array.from({ length: cellColumns * cellRows }, () => 0);

  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const offset = (y * sampleWidth + x) * 4;
      const previousLuma =
        previous[offset] * 0.299 + previous[offset + 1] * 0.587 + previous[offset + 2] * 0.114;
      const currentLuma =
        current[offset] * 0.299 + current[offset + 1] * 0.587 + current[offset + 2] * 0.114;
      const diff = Math.abs(currentLuma - previousLuma);

      if (diff <= 8) {
        continue;
      }

      const weight = diff - 8;
      totalWeight += weight;
      activePixels += 1;

      const cellX = Math.min(cellColumns - 1, Math.floor((x / sampleWidth) * cellColumns));
      const cellY = Math.min(cellRows - 1, Math.floor((y / sampleHeight) * cellRows));
      const cellIndex = cellY * cellColumns + cellX;
      cellWeights[cellIndex] += weight;
      cellWeightedX[cellIndex] += x * weight;
      cellWeightedY[cellIndex] += y * weight;
    }
  }

  motionCapture.previousFrame.set(current);

  const activeRatio = activePixels / (sampleWidth * sampleHeight);
  const broadMotionPenalty = activeRatio > 0.34 ? clamp(1 - (activeRatio - 0.34) / 0.28, 0, 1) : 1;
  const confidence = clamp((totalWeight - 260) / 8500, 0, 1) * broadMotionPenalty;

  if (confidence <= 0.025 || totalWeight <= 0) {
    return;
  }

  const points = cellWeights
    .map((weight, index) => ({ weight, index }))
    .filter((cell) => cell.weight > 60)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)
    .map((cell) => ({
      x: (cellWeightedX[cell.index] / cell.weight / sampleWidth) * window.innerWidth,
      y: (cellWeightedY[cell.index] / cell.weight / sampleHeight) * window.innerHeight,
      strength: clamp((cell.weight / Math.max(1, totalWeight)) * 1.7 + confidence * 0.26, 0.08, 0.55)
    }));

  updateMotionHighlights(points, now);
}

function stopMotionCapture() {
  if (!motionCapture.stream) {
    motionCapture.available = false;
    motionCapture.video = null;
    motionCapture.previousFrame = null;
    return;
  }

  for (const track of motionCapture.stream.getTracks()) {
    track.stop();
  }

  motionCapture.stream = null;
  motionCapture.video = null;
  motionCapture.available = false;
  motionCapture.previousFrame = null;
}

async function startMotionCapture() {
  if (motionCapture.stream) {
    return;
  }

  if (!state.settings.veilEnabled) {
    state.motionStatus = motionCapture.enabled ? 'paused' : 'disabled';
    return;
  }

  if (!motionCapture.enabled || !navigator.mediaDevices?.getUserMedia) {
    state.motionStatus = motionCapture.enabled ? 'unavailable' : 'disabled';
    return;
  }

  try {
    const source = await window.focusVeil?.getCaptureSource();
    if (!source?.id) {
      state.motionStatus = 'unavailable';
      return;
    }

    if (!state.settings.veilEnabled || !motionCapture.enabled) {
      state.motionStatus = state.settings.veilEnabled ? 'disabled' : 'paused';
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
          maxWidth: 640,
          maxHeight: 360,
          maxFrameRate: 5
        }
      }
    });

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();

    if (!state.settings.veilEnabled || !motionCapture.enabled) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      state.motionStatus = state.settings.veilEnabled ? 'disabled' : 'paused';
      return;
    }

    motionCapture.stream = stream;
    motionCapture.video = video;
    motionCapture.available = true;
    state.motionStatus = 'active';
  } catch (error) {
    console.warn('Focus Veil: motion highlight capture unavailable.', error);
    stopMotionCapture();
    state.motionStatus = 'fallback';
  }
}

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
  lastDraw = 0;
  requestActiveFrame(500);
});

window.addEventListener('mousemove', (event) => {
  state.mouseX = event.clientX;
  state.mouseY = event.clientY;
  state.lastMouseMoveAt = performance.now();
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

window.focusVeil?.getMainState().then((mainState) => {
  applySettings(mainState.settings);
  applyTimerState(mainState.timer);
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
    simulateMotion(x, y, strength = 0.8) {
      updateMotionHighlights([{ x, y, strength }]);
      return getPublicState();
    },
    async setOperationMode(enabled) {
      setOperationMode(Boolean(enabled));
      await window.focusVeil?.setOperationMode(Boolean(enabled));
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
    }
  };
}

resizeCanvas();
updateTimerUi();
syncSettingsControls();
startMotionCapture();
startAnimationLoop(true);
