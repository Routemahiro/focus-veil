const firstCheckDelayMs = 10_000;

function isPortableBuild() {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE);
}

function createAutoUpdateController({ app, isSmoke = false }) {
  let autoUpdater = null;
  let settings = { autoUpdateEnabled: true };
  let downloadedVersion = null;
  let checkTimer = null;
  let listenersAttached = false;
  let onStateChange = null;

  function notifyStateChange() {
    if (typeof onStateChange === 'function') {
      onStateChange();
    }
  }

  function isInstalledWindowsBuild() {
    return process.platform === 'win32' && app.isPackaged && !isPortableBuild() && !isSmoke;
  }

  function isEnabled() {
    return settings.autoUpdateEnabled === true;
  }

  function canCheckOrApply() {
    return isInstalledWindowsBuild() && isEnabled();
  }

  function configureUpdater(updater) {
    updater.autoDownload = true;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.disableWebInstaller = true;
    updater.autoRunAppAfterInstall = true;
    // Unsigned NSIS: never silently run the installer (SmartScreen needs a visible launch).
    updater.autoInstallOnAppQuit = false;
    // electron-updater 6 treats this as a verifier function, not a boolean.
    updater.verifyUpdateCodeSignature = async () => null;
  }

  function loadAutoUpdater() {
    if (autoUpdater) {
      return autoUpdater;
    }

    ({ autoUpdater } = require('electron-updater'));
    configureUpdater(autoUpdater);
    return autoUpdater;
  }

  function attachListeners(updater) {
    if (listenersAttached) {
      return;
    }

    listenersAttached = true;

    updater.on('error', (error) => {
      console.warn('Focus Veil: auto-update error.', error);
    });

    updater.on('update-available', (info) => {
      if (!canCheckOrApply()) {
        return;
      }

      console.log(`Focus Veil: update available ${info.version}`);
    });

    updater.on('update-downloaded', (info) => {
      if (!canCheckOrApply()) {
        downloadedVersion = null;
        updater.autoInstallOnAppQuit = false;
        notifyStateChange();
        return;
      }

      downloadedVersion = info.version;
      updater.autoInstallOnAppQuit = false;
      console.log(`Focus Veil: update downloaded ${info.version}`);
      notifyStateChange();
    });
  }

  function disableLiveUpdate() {
    downloadedVersion = null;
    if (checkTimer) {
      clearTimeout(checkTimer);
      checkTimer = null;
    }

    if (autoUpdater) {
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = false;
    }

    notifyStateChange();
  }

  function checkNow() {
    if (!canCheckOrApply()) {
      if (autoUpdater) {
        autoUpdater.autoInstallOnAppQuit = false;
      }
      return Promise.resolve(null);
    }

    const updater = loadAutoUpdater();
    configureUpdater(updater);
    attachListeners(updater);

    return updater.checkForUpdates().catch((error) => {
      console.warn('Focus Veil: update check failed.', error);
      return null;
    });
  }

  function scheduleCheck() {
    if (!canCheckOrApply() || checkTimer) {
      return;
    }

    checkTimer = setTimeout(() => {
      checkTimer = null;
      checkNow();
    }, firstCheckDelayMs);
  }

  function start(nextSettings) {
    settings = nextSettings;
    if (!isEnabled()) {
      disableLiveUpdate();
      return;
    }

    scheduleCheck();
  }

  function syncFromSettings(nextSettings) {
    const wasEnabled = isEnabled();
    settings = nextSettings;

    if (!isEnabled()) {
      disableLiveUpdate();
      return;
    }

    if (autoUpdater) {
      configureUpdater(autoUpdater);
    }

    if (!wasEnabled) {
      scheduleCheck();
    }
  }

  function preventInstallOnQuit() {
    if (autoUpdater) {
      autoUpdater.autoInstallOnAppQuit = false;
    }
  }

  function quitAndInstall() {
    if (!canCheckOrApply() || !downloadedVersion || !autoUpdater) {
      return false;
    }

    autoUpdater.quitAndInstall(false, true);
    return true;
  }

  function getTrayState() {
    return {
      supported: isInstalledWindowsBuild(),
      enabled: isEnabled(),
      downloadedVersion
    };
  }

  function setOnStateChange(callback) {
    onStateChange = callback;
  }

  return {
    start,
    syncFromSettings,
    preventInstallOnQuit,
    quitAndInstall,
    getTrayState,
    setOnStateChange,
    isPortableBuild,
    isInstalledWindowsBuild
  };
}

module.exports = {
  createAutoUpdateController,
  isPortableBuild
};
