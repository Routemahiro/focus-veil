const firstCheckDelayMs = 10_000;
const releasesPageUrl = 'https://github.com/Routemahiro/focus-veil/releases/latest';

function isPortableBuild(env = process.env) {
  return Boolean(env.PORTABLE_EXECUTABLE_DIR || env.PORTABLE_EXECUTABLE_FILE);
}

function createAutoUpdateController({
  app,
  isSmoke = false,
  platform = process.platform,
  env = process.env,
  loadUpdaterModule = () => require('electron-updater'),
  checkDelayMs = firstCheckDelayMs
}) {
  let autoUpdater = null;
  let settings = { autoUpdateEnabled: true };
  let downloadedVersion = null;
  let downloadedOrigin = null;
  let checkOrigin = null;
  let checkTimer = null;
  let listenersAttached = false;
  let onStateChange = null;
  let onDownloadProgress = null;
  let phase = 'idle';
  let message = '';
  let offerReleasesPage = false;
  let downloadProgress = {
    transferring: false,
    percent: 0
  };

  function notifyStateChange() {
    if (typeof onStateChange === 'function') {
      onStateChange();
    }
  }

  function notifyDownloadProgress() {
    if (typeof onDownloadProgress === 'function') {
      onDownloadProgress(getDownloadProgress());
    }
  }

  function normalizePercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round(number * 10) / 10));
  }

  function getDownloadProgress() {
    return {
      transferring: downloadProgress.transferring,
      percent: downloadProgress.percent
    };
  }

  function setDownloadProgress({ transferring, percent } = {}) {
    const nextTransferring = Boolean(transferring);
    const nextPercent = nextTransferring ? normalizePercent(percent) : 0;

    if (
      downloadProgress.transferring === nextTransferring &&
      downloadProgress.percent === nextPercent
    ) {
      return getDownloadProgress();
    }

    downloadProgress = {
      transferring: nextTransferring,
      percent: nextPercent
    };
    notifyDownloadProgress();
    return getDownloadProgress();
  }

  function portableBuild() {
    return isPortableBuild(env);
  }

  function canInstallUpdates() {
    return platform === 'win32' && app.isPackaged && !portableBuild() && !isSmoke;
  }

  function isEnabled() {
    return settings.autoUpdateEnabled === true;
  }

  function releasesFields() {
    return {
      offerReleasesPage: offerReleasesPage === true,
      releasesUrl: offerReleasesPage ? releasesPageUrl : null
    };
  }

  function describeUnavailable() {
    if (portableBuild()) {
      return {
        reason: 'portable',
        trayLabel: 'Portable build cannot update',
        message: 'Portable builds cannot install updates. Use the Setup installer.'
      };
    }

    if (!app.isPackaged || isSmoke) {
      return {
        reason: 'dev',
        trayLabel: 'npm start cannot update',
        message: 'npm start cannot install updates. Use the Setup installer.'
      };
    }

    return {
      reason: 'unsupported',
      trayLabel: 'Setup install required to update',
      message: 'This build cannot install updates. Use the Windows Setup installer.'
    };
  }

  function sessionOpen() {
    if (!canInstallUpdates()) {
      return false;
    }

    if (checkOrigin === 'manual') {
      return true;
    }

    return isEnabled();
  }

  function hasManualResult() {
    return checkOrigin === 'manual' || downloadedOrigin === 'manual';
  }

  function trayLabelForPhase() {
    if (phase === 'checking') {
      return 'Checking for updates…';
    }

    if (phase === 'downloading' || downloadProgress.transferring) {
      return 'Downloading update…';
    }

    return 'Check for updates';
  }

  function getUpdateControl() {
    const progress = getDownloadProgress();

    if (!canInstallUpdates()) {
      const described = describeUnavailable();
      return {
        supported: false,
        reason: described.reason,
        phase: 'unavailable',
        message: described.message,
        trayLabel: described.trayLabel,
        downloadedVersion: null,
        downloadedOrigin: null,
        transferring: progress.transferring,
        percent: progress.percent,
        ...releasesFields()
      };
    }

    return {
      supported: true,
      reason: null,
      phase,
      message,
      trayLabel: trayLabelForPhase(),
      downloadedVersion,
      downloadedOrigin,
      transferring: progress.transferring,
      percent: progress.percent,
      ...releasesFields()
    };
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

    ({ autoUpdater } = loadUpdaterModule());
    configureUpdater(autoUpdater);
    return autoUpdater;
  }

  function attachListeners(updater) {
    if (listenersAttached) {
      return;
    }

    listenersAttached = true;

    updater.on('error', (error) => {
      setDownloadProgress({ transferring: false, percent: 0 });
      console.warn('Focus Veil: auto-update error.', error);

      if (!downloadedVersion) {
        phase = 'error';
        message = 'Update check failed.';
        if (downloadedOrigin !== 'manual') {
          checkOrigin = null;
        }
      }

      notifyStateChange();
    });

    updater.on('update-available', (info) => {
      if (!sessionOpen()) {
        setDownloadProgress({ transferring: false, percent: 0 });
        return;
      }

      phase = 'downloading';
      message = '';
      setDownloadProgress({ transferring: true, percent: 0 });
      console.log(`Focus Veil: update available ${info.version}`);
      notifyStateChange();
    });

    updater.on('update-not-available', () => {
      setDownloadProgress({ transferring: false, percent: 0 });

      if (downloadedVersion) {
        phase = 'downloaded';
        message = 'Downloaded. Use Restart to Update.';
      } else {
        downloadedOrigin = null;
        checkOrigin = null;
        phase = 'current';
        message = 'Already on the latest release.';
      }

      notifyStateChange();
    });

    updater.on('download-progress', (progress) => {
      if (!sessionOpen()) {
        setDownloadProgress({ transferring: false, percent: 0 });
        return;
      }

      phase = 'downloading';
      setDownloadProgress({
        transferring: true,
        percent: progress?.percent
      });
    });

    updater.on('update-downloaded', (info) => {
      setDownloadProgress({ transferring: false, percent: 0 });

      if (!sessionOpen()) {
        downloadedVersion = null;
        downloadedOrigin = null;
        checkOrigin = null;
        phase = 'idle';
        message = '';
        updater.autoInstallOnAppQuit = false;
        notifyStateChange();
        return;
      }

      downloadedVersion = info.version;
      downloadedOrigin = checkOrigin === 'manual' ? 'manual' : 'auto';
      phase = 'downloaded';
      message = 'Downloaded. Use Restart to Update.';
      updater.autoInstallOnAppQuit = false;
      console.log(`Focus Veil: update downloaded ${info.version}`);
      notifyStateChange();
    });
  }

  function markUnavailable({ offerReleases = false } = {}) {
    downloadedVersion = null;
    downloadedOrigin = null;
    checkOrigin = null;
    offerReleasesPage = Boolean(offerReleases);
    phase = 'unavailable';
    message = describeUnavailable().message;

    if (checkTimer) {
      clearTimeout(checkTimer);
      checkTimer = null;
    }

    setDownloadProgress({ transferring: false, percent: 0 });

    if (autoUpdater) {
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = false;
    }

    notifyStateChange();
  }

  function disableLiveUpdate() {
    if (checkTimer) {
      clearTimeout(checkTimer);
      checkTimer = null;
    }

    // A manual check is independent of the Auto-update toggle.
    if (hasManualResult()) {
      if (autoUpdater) {
        autoUpdater.autoInstallOnAppQuit = false;
      }
      notifyStateChange();
      return;
    }

    downloadedVersion = null;
    downloadedOrigin = null;
    checkOrigin = null;
    offerReleasesPage = false;
    setDownloadProgress({ transferring: false, percent: 0 });

    if (canInstallUpdates()) {
      phase = 'idle';
      message = '';
    } else {
      phase = 'unavailable';
      message = describeUnavailable().message;
    }

    if (autoUpdater) {
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = false;
    }

    notifyStateChange();
  }

  function runCheck(origin) {
    if (!canInstallUpdates()) {
      markUnavailable({ offerReleases: origin === 'manual' });
      return Promise.resolve(getUpdateControl());
    }

    offerReleasesPage = false;

    if (origin !== 'manual' && !isEnabled()) {
      return Promise.resolve(getUpdateControl());
    }

    if (phase === 'checking' || phase === 'downloading' || downloadProgress.transferring) {
      if (origin === 'manual') {
        checkOrigin = 'manual';
      }
      return Promise.resolve(getUpdateControl());
    }

    checkOrigin = origin;
    phase = 'checking';
    message = 'Checking GitHub Releases…';
    notifyStateChange();

    const updater = loadAutoUpdater();
    configureUpdater(updater);
    attachListeners(updater);

    return updater
      .checkForUpdates()
      .then(() => getUpdateControl())
      .catch((error) => {
        console.warn('Focus Veil: update check failed.', error);
        if (phase === 'checking') {
          phase = 'error';
          message = 'Update check failed.';
          setDownloadProgress({ transferring: false, percent: 0 });
          if (downloadedOrigin !== 'manual') {
            checkOrigin = null;
          }
          notifyStateChange();
        }
        return getUpdateControl();
      });
  }

  function checkNow() {
    if (checkOrigin === 'manual' && (phase === 'checking' || phase === 'downloading')) {
      return Promise.resolve(getUpdateControl());
    }

    return runCheck('auto');
  }

  function requestManualCheck() {
    return runCheck('manual');
  }

  function resolveReleasesPrompt(confirmed) {
    if (confirmed === true && offerReleasesPage) {
      offerReleasesPage = false;
      notifyStateChange();
      return releasesPageUrl;
    }

    if (offerReleasesPage) {
      offerReleasesPage = false;
      notifyStateChange();
    }

    return null;
  }

  function scheduleCheck() {
    if (!canInstallUpdates() || !isEnabled() || checkTimer) {
      return;
    }

    checkTimer = setTimeout(() => {
      checkTimer = null;
      checkNow();
    }, checkDelayMs);
    if (typeof checkTimer.unref === 'function') {
      checkTimer.unref();
    }
  }

  function start(nextSettings) {
    settings = nextSettings;
    if (!canInstallUpdates()) {
      markUnavailable();
      return;
    }

    if (!isEnabled()) {
      disableLiveUpdate();
      return;
    }

    phase = 'idle';
    message = '';
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
    if (!canInstallUpdates() || !downloadedVersion || !autoUpdater) {
      return false;
    }

    if (!isEnabled() && downloadedOrigin !== 'manual') {
      return false;
    }

    autoUpdater.quitAndInstall(false, true);
    return true;
  }

  function getTrayState() {
    return {
      ...getUpdateControl(),
      enabled: isEnabled()
    };
  }

  function setOnStateChange(callback) {
    onStateChange = callback;
  }

  function setOnDownloadProgress(callback) {
    onDownloadProgress = callback;
  }

  function debugSetDownloadProgress(progress) {
    return setDownloadProgress(progress);
  }

  return {
    start,
    syncFromSettings,
    preventInstallOnQuit,
    quitAndInstall,
    checkNow,
    requestManualCheck,
    resolveReleasesPrompt,
    getTrayState,
    getUpdateControl,
    getDownloadProgress,
    setOnStateChange,
    setOnDownloadProgress,
    debugSetDownloadProgress,
    isPortableBuild: portableBuild,
    isInstalledWindowsBuild: canInstallUpdates
  };
}

module.exports = {
  createAutoUpdateController,
  isPortableBuild,
  releasesPageUrl
};
