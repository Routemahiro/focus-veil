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
  lastTimerTick: performance.now(),
  notificationUntil: 0,
  notificationCount: 0
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

function drawWater(width, height, now, pulse) {
  const spacing = 86;
  const time = now * 0.00018;
  context.save();
  context.lineWidth = 1;
  context.globalAlpha = 0.34 + pulse * 0.1;

  for (let row = -spacing; row < height + spacing; row += spacing) {
    context.beginPath();
    for (let x = -40; x <= width + 40; x += 18) {
      const y =
        row +
        Math.sin(x * 0.012 + time + row * 0.01) * 5 +
        Math.sin(x * 0.028 - time * 0.7) * 2;

      if (x === -40) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    context.strokeStyle = 'rgba(130, 207, 196, 0.08)';
    context.stroke();
  }

  for (let row = -spacing / 2; row < height + spacing; row += spacing * 1.45) {
    context.beginPath();
    for (let x = -40; x <= width + 40; x += 24) {
      const y = row + Math.sin(x * 0.015 - time * 0.9 + row * 0.02) * 3;
      if (x === -40) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    context.strokeStyle = 'rgba(236, 210, 148, 0.035)';
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

  drawWater(width, height, now, pulse);
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
  state.notificationCount += 1;
}

function completePhase() {
  triggerNotification();
  state.phase = state.phase === 'work' ? 'break' : 'work';
  state.remaining = durations[state.phase];
  state.running = false;
  state.lastTimerTick = performance.now();
  updateTimerUi();
}

function startTimer() {
  state.running = true;
  state.lastTimerTick = performance.now();
  updateTimerUi();
}

function pauseTimer() {
  state.running = false;
  updateTimerUi();
}

function resetTimer() {
  state.running = false;
  state.remaining = durations[state.phase];
  state.lastTimerTick = performance.now();
  updateTimerUi();
}

function tickTimer() {
  const now = performance.now();

  if (!state.running) {
    state.lastTimerTick = now;
    return;
  }

  const elapsed = (now - state.lastTimerTick) / 1000;
  state.lastTimerTick = now;
  state.remaining -= elapsed;

  if (state.remaining <= 0) {
    completePhase();
    return;
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
    controlsVisible: getComputedStyle(timerControls).display !== 'none'
  };
}

timerControls.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  if (action === 'start') {
    startTimer();
  } else if (action === 'pause') {
    pauseTimer();
  } else if (action === 'reset') {
    resetTimer();
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

if (isPreview) {
  body.classList.add('preview-mode');
}

if (isSmoke) {
  window.focusVeilSmoke = {
    click(action) {
      document.querySelector(`button[data-action="${action}"]`)?.click();
      return getPublicState();
    },
    getState: getPublicState,
    setMouse(x, y) {
      state.mouseX = x;
      state.mouseY = y;
      return getPublicState();
    },
    setOperationMode(enabled) {
      setOperationMode(Boolean(enabled));
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
setInterval(tickTimer, 100);
requestAnimationFrame(animationLoop);
