const body = document.body;
const canvas = document.querySelector('#veil-canvas');
const context = canvas.getContext('2d', { alpha: true });
const timerPanel = document.querySelector('.timer-panel');
const modeLabel = document.querySelector('#mode-label');
const timeReadout = document.querySelector('#time-readout');
const timerControls = document.querySelector('.timer-controls');

const query = new URLSearchParams(window.location.search);
const isSmoke = query.get('smoke') === '1';
const isPreview = query.get('preview') === '1';
const hasControls = query.get('controls') !== '0';
const durations = {
  work: isSmoke ? 4 : 25 * 60,
  break: isSmoke ? 2 : 5 * 60
};

const state = {
  operationMode: false,
  controlHoldMode: false,
  mouseX: window.innerWidth / 2,
  mouseY: window.innerHeight / 2,
  phase: 'work',
  running: false,
  remaining: durations.work,
  notificationUntil: 0,
  notificationCount: 0,
  lastNotificationCount: 0,
  nextRippleAt: performance.now() + 1800 + Math.random() * 1800,
  ripples: []
};

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

function drawVeil(now = performance.now()) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pulse = getNotificationPulse(now);
  const veilAlpha = 0.14 - pulse * 0.055;
  const radius = (state.operationMode ? 280 : 230) + pulse * 90;

  context.clearRect(0, 0, width, height);

  context.fillStyle = `rgba(0, 0, 0, ${veilAlpha.toFixed(3)})`;
  context.fillRect(0, 0, width, height);

  const gradient = context.createRadialGradient(
    state.mouseX,
    state.mouseY,
    20,
    state.mouseX,
    state.mouseY,
    radius
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.54)');
  gradient.addColorStop(0.56, 'rgba(0, 0, 0, 0.26)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  context.globalCompositeOperation = 'destination-out';
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(state.mouseX, state.mouseY, radius, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = 'source-over';

  const glow = context.createRadialGradient(
    state.mouseX,
    state.mouseY,
    0,
    state.mouseX,
    state.mouseY,
    radius * 0.82
  );
  glow.addColorStop(0, `rgba(226, 248, 241, ${(0.05 + pulse * 0.035).toFixed(3)})`);
  glow.addColorStop(0.6, 'rgba(186, 226, 216, 0.018)');
  glow.addColorStop(1, 'rgba(186, 226, 216, 0)');
  context.fillStyle = glow;
  context.beginPath();
  context.arc(state.mouseX, state.mouseY, radius * 0.82, 0, Math.PI * 2);
  context.fill();

  drawRippleField(width, height, now, pulse);
}

let lastDraw = 0;

function animationLoop(now) {
  if (now - lastDraw >= 32) {
    drawVeil(now);
    lastDraw = now;
  }

  requestAnimationFrame(animationLoop);
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
  addRipple(now, state.mouseX, state.mouseY, 1.15);
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
}

function getPublicState() {
  return {
    operationMode: state.operationMode,
    phase: state.phase,
    running: state.running,
    remaining: Number(state.remaining.toFixed(2)),
    timeText: timeReadout.textContent,
    notificationCount: state.notificationCount,
    controlsVisible: hasControls && getComputedStyle(timerControls).display !== 'none'
  };
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

window.addEventListener('resize', resizeCanvas);

window.addEventListener('mousemove', (event) => {
  state.mouseX = event.clientX;
  state.mouseY = event.clientY;
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
    }
  };
}

resizeCanvas();
updateTimerUi();
requestAnimationFrame(animationLoop);
