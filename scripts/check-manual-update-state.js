const assert = require('node:assert/strict');
const { createAutoUpdateController, releasesPageUrl } = require('../src/auto-update');

function createFakeUpdater() {
  const handlers = {};
  const updater = {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    quitCalled: false,
    checks: 0,
    mode: 'download',
    on(event, handler) {
      handlers[event] = handler;
    },
    emit(event, payload) {
      if (typeof handlers[event] === 'function') {
        handlers[event](payload);
      }
    },
    checkForUpdates() {
      updater.checks += 1;
      if (updater.mode === 'download') {
        updater.emit('update-available', { version: '0.1.7' });
        updater.emit('download-progress', { percent: 42 });
        updater.emit('update-downloaded', { version: '0.1.7' });
      } else if (updater.mode === 'current') {
        updater.emit('update-not-available', { version: '0.1.6' });
      } else if (updater.mode === 'error') {
        updater.emit('error', new Error('network'));
        return Promise.reject(new Error('network'));
      }
      return Promise.resolve(null);
    },
    quitAndInstall() {
      updater.quitCalled = true;
    }
  };
  return updater;
}

function createController(updater, options = {}) {
  return createAutoUpdateController({
    app: { isPackaged: options.packaged !== false },
    isSmoke: Boolean(options.isSmoke),
    platform: options.platform || 'win32',
    env: options.env || {},
    checkDelayMs: 60_000,
    loadUpdaterModule() {
      if (options.forbidLoad) {
        throw new Error('electron-updater should not load');
      }
      return { autoUpdater: updater };
    }
  });
}

async function testManualCheckWhileAutoOffDownloads() {
  const updater = createFakeUpdater();
  const seen = [];
  const controller = createController(updater);
  controller.setOnDownloadProgress((progress) => {
    seen.push(progress.percent);
  });
  controller.start({ autoUpdateEnabled: false });

  const idle = controller.getUpdateControl();
  assert.equal(idle.supported, true);
  assert.equal(idle.phase, 'idle');
  assert.equal(updater.checks, 0);

  const status = await controller.requestManualCheck();
  assert.equal(updater.checks, 1);
  assert.equal(updater.autoDownload, true);
  assert.equal(status.phase, 'downloaded');
  assert.equal(status.downloadedVersion, '0.1.7');
  assert.equal(status.downloadedOrigin, 'manual');
  assert.equal(status.transferring, false);
  assert.equal(status.message, 'Downloaded. Use Restart to Update.');
  assert.equal(status.offerReleasesPage, false);
  assert.equal(status.releasesUrl, null);
  assert.equal(controller.resolveReleasesPrompt(true), null);
  assert.ok(seen.includes(42));
  assert.equal(controller.quitAndInstall(), true);
  assert.equal(updater.quitCalled, true);

  controller.syncFromSettings({ autoUpdateEnabled: false });
  const kept = controller.getTrayState();
  assert.equal(kept.enabled, false);
  assert.equal(kept.downloadedVersion, '0.1.7');
  assert.equal(kept.trayLabel, 'Check for updates');
}

async function testAutoOffClearsAutomaticDownload() {
  const updater = createFakeUpdater();
  const controller = createController(updater);
  controller.start({ autoUpdateEnabled: true });
  const status = await controller.checkNow();
  assert.equal(status.downloadedOrigin, 'auto');
  assert.equal(status.phase, 'downloaded');

  controller.syncFromSettings({ autoUpdateEnabled: false });
  const cleared = controller.getTrayState();
  assert.equal(cleared.downloadedVersion, null);
  assert.equal(cleared.phase, 'idle');
  assert.equal(controller.quitAndInstall(), false);
  assert.equal(updater.quitCalled, false);
}

async function testUpToDateDoesNotDownload() {
  const updater = createFakeUpdater();
  updater.mode = 'current';
  const controller = createController(updater);
  controller.start({ autoUpdateEnabled: true });
  const status = await controller.requestManualCheck();
  assert.equal(status.phase, 'current');
  assert.equal(status.transferring, false);
  assert.equal(status.downloadedVersion, null);
  assert.equal(status.message, 'Already on the latest release.');
}

async function testCheckFailureDoesNotLeaveProgress() {
  const updater = createFakeUpdater();
  updater.mode = 'error';
  const controller = createController(updater);
  controller.start({ autoUpdateEnabled: false });
  const status = await controller.requestManualCheck();
  assert.equal(status.phase, 'error');
  assert.equal(status.transferring, false);
  assert.equal(status.percent, 0);
  assert.equal(status.message, 'Update check failed.');
}

function assertReleasesPromptWaitsForYes(controller, status) {
  assert.equal(status.offerReleasesPage, true);
  assert.equal(status.releasesUrl, releasesPageUrl);
  assert.equal(controller.resolveReleasesPrompt(false), null);
  const declined = controller.getUpdateControl();
  assert.equal(declined.offerReleasesPage, false);
  assert.equal(declined.releasesUrl, null);
  assert.match(declined.message, /Setup installer/);

  return controller.requestManualCheck().then((again) => {
    assert.equal(again.offerReleasesPage, true);
    assert.equal(controller.resolveReleasesPrompt(true), releasesPageUrl);
    assert.equal(controller.getUpdateControl().offerReleasesPage, false);
    assert.equal(controller.resolveReleasesPrompt(true), null);
  });
}

async function testPortableCannotInstall() {
  const controller = createController(null, {
    env: { PORTABLE_EXECUTABLE_FILE: 'FocusVeil-Portable.exe' },
    forbidLoad: true
  });
  controller.start({ autoUpdateEnabled: true });
  const before = controller.getUpdateControl();
  assert.equal(before.offerReleasesPage, false);
  assert.match(before.message, /Setup installer/);
  const status = await controller.requestManualCheck();
  assert.equal(status.supported, false);
  assert.equal(status.reason, 'portable');
  assert.equal(status.phase, 'unavailable');
  assert.equal(status.transferring, false);
  assert.match(status.message, /Portable builds cannot install updates/);
  assert.match(status.message, /Setup installer/);
  assert.equal(status.trayLabel, 'Portable build cannot update');
  assert.equal(controller.quitAndInstall(), false);
  await assertReleasesPromptWaitsForYes(controller, status);
}

async function testNpmStartCannotInstall() {
  const controller = createController(null, {
    packaged: false,
    platform: 'linux',
    forbidLoad: true
  });
  controller.start({ autoUpdateEnabled: true });
  const before = controller.getUpdateControl();
  assert.equal(before.offerReleasesPage, false);
  const status = await controller.requestManualCheck();
  assert.equal(status.supported, false);
  assert.equal(status.reason, 'dev');
  assert.equal(status.phase, 'unavailable');
  assert.equal(status.transferring, false);
  assert.match(status.message, /npm start cannot install updates/);
  assert.match(status.message, /Setup installer/);
  assert.equal(status.trayLabel, 'npm start cannot update');
  await assertReleasesPromptWaitsForYes(controller, status);
}

async function main() {
  await testManualCheckWhileAutoOffDownloads();
  await testAutoOffClearsAutomaticDownload();
  await testUpToDateDoesNotDownload();
  await testCheckFailureDoesNotLeaveProgress();
  await testPortableCannotInstall();
  await testNpmStartCannotInstall();
  console.log('manual update state checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
