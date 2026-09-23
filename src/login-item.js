function isPortableBuild(env = process.env) {
  return Boolean(env.PORTABLE_EXECUTABLE_DIR || env.PORTABLE_EXECUTABLE_FILE);
}

function describeLoginItemAvailability({
  platform = process.platform,
  isPackaged = false,
  isSmoke = false,
  env = process.env
} = {}) {
  if (isPortableBuild(env)) {
    return {
      supported: false,
      reason: 'portable',
      message: 'Portable builds cannot start at login. Use the Setup installer.'
    };
  }

  if (!isPackaged || isSmoke) {
    return {
      supported: false,
      reason: 'dev',
      message: 'npm start cannot start at login. Use the Setup installer.'
    };
  }

  if (platform !== 'win32') {
    return {
      supported: false,
      reason: 'unsupported',
      message: 'This build cannot start at login. Use the Windows Setup installer.'
    };
  }

  return {
    supported: true,
    reason: null,
    message: ''
  };
}

function createLoginItemController({
  app,
  isSmoke = false,
  platform = process.platform,
  env = process.env,
  execPath = process.execPath
} = {}) {
  let settings = { openAtLogin: false };
  let lastApply = {
    attempted: false,
    applied: false,
    desired: false
  };

  function availability() {
    return describeLoginItemAvailability({
      platform,
      isPackaged: Boolean(app?.isPackaged),
      isSmoke,
      env
    });
  }

  function loginItemOptions(openAtLogin) {
    return {
      openAtLogin: openAtLogin === true,
      path: execPath,
      args: []
    };
  }

  function getControl() {
    const avail = availability();
    const desired = settings.openAtLogin === true;
    let message = '';

    if (!avail.supported) {
      message = avail.message;
    } else if (desired && lastApply.attempted && !lastApply.applied) {
      message = 'Windows did not register the login item.';
    }

    return {
      supported: avail.supported,
      reason: avail.reason,
      message,
      openAtLogin: desired,
      applied: avail.supported && lastApply.applied && lastApply.desired === desired
    };
  }

  function apply() {
    const avail = availability();
    const desired = settings.openAtLogin === true;

    if (!avail.supported) {
      lastApply = {
        attempted: false,
        applied: false,
        desired
      };
      return getControl();
    }

    try {
      app.setLoginItemSettings(loginItemOptions(desired));
      lastApply = {
        attempted: true,
        applied: true,
        desired
      };
    } catch {
      lastApply = {
        attempted: true,
        applied: false,
        desired
      };
    }

    return getControl();
  }

  function syncFromSettings(nextSettings = {}) {
    settings = {
      openAtLogin: nextSettings.openAtLogin === true
    };
    return apply();
  }

  return {
    availability,
    getControl,
    syncFromSettings
  };
}

module.exports = {
  isPortableBuild,
  describeLoginItemAvailability,
  createLoginItemController
};
