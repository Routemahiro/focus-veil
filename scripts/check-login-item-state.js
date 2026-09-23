const assert = require('node:assert/strict');
const { createLoginItemController, describeLoginItemAvailability } = require('../src/login-item');

function createFakeApp({ packaged = true } = {}) {
  return {
    isPackaged: packaged,
    calls: [],
    setLoginItemSettings(settings) {
      this.calls.push({ ...settings });
    }
  };
}

function createController(options = {}) {
  const app = options.app || createFakeApp({ packaged: options.packaged !== false });
  const controller = createLoginItemController({
    app,
    isSmoke: Boolean(options.isSmoke),
    platform: options.platform || 'win32',
    env: options.env || {},
    execPath: options.execPath || 'C:\\Users\\me\\AppData\\Local\\Programs\\Focus Veil\\FocusVeil.exe'
  });
  return { app, controller };
}

function testSetupRegistersOpenAtLogin() {
  const { app, controller } = createController();
  const enabled = controller.syncFromSettings({ openAtLogin: true });

  assert.equal(enabled.supported, true);
  assert.equal(enabled.reason, null);
  assert.equal(enabled.message, '');
  assert.equal(enabled.openAtLogin, true);
  assert.equal(enabled.applied, true);
  assert.equal(app.calls.length, 1);
  assert.deepEqual(app.calls[0], {
    openAtLogin: true,
    path: 'C:\\Users\\me\\AppData\\Local\\Programs\\Focus Veil\\FocusVeil.exe',
    args: []
  });

  const disabled = controller.syncFromSettings({ openAtLogin: false });
  assert.equal(disabled.openAtLogin, false);
  assert.equal(disabled.applied, true);
  assert.equal(disabled.message, '');
  assert.equal(app.calls.length, 2);
  assert.equal(app.calls[1].openAtLogin, false);
}

function testPortableDoesNotRegister() {
  const { app, controller } = createController({
    env: { PORTABLE_EXECUTABLE_DIR: 'D:\\FocusVeil' }
  });
  const status = controller.syncFromSettings({ openAtLogin: true });

  assert.equal(status.supported, false);
  assert.equal(status.reason, 'portable');
  assert.equal(status.openAtLogin, true);
  assert.equal(status.applied, false);
  assert.match(status.message, /Portable builds cannot start at login/);
  assert.match(status.message, /Setup installer/);
  assert.equal(app.calls.length, 0);
}

function testNpmStartDoesNotRegister() {
  const { app, controller } = createController({ packaged: false });
  const status = controller.syncFromSettings({ openAtLogin: true });

  assert.equal(status.supported, false);
  assert.equal(status.reason, 'dev');
  assert.equal(status.openAtLogin, true);
  assert.equal(status.applied, false);
  assert.match(status.message, /npm start cannot start at login/);
  assert.match(status.message, /Setup installer/);
  assert.equal(app.calls.length, 0);
}

function testSmokeDoesNotRegister() {
  const { app, controller } = createController({ isSmoke: true });
  const status = controller.syncFromSettings({ openAtLogin: true });

  assert.equal(status.supported, false);
  assert.equal(status.reason, 'dev');
  assert.equal(app.calls.length, 0);
}

function testNonWindowsPackagedDoesNotRegister() {
  const { app, controller } = createController({ platform: 'linux' });
  const status = controller.syncFromSettings({ openAtLogin: true });

  assert.equal(status.supported, false);
  assert.equal(status.reason, 'unsupported');
  assert.match(status.message, /Windows Setup installer/);
  assert.equal(app.calls.length, 0);
}

function testFailedSetShowsError() {
  const app = createFakeApp();
  app.setLoginItemSettings = () => {
    throw new Error('registry');
  };
  const { controller } = createController({ app });
  const status = controller.syncFromSettings({ openAtLogin: true });

  assert.equal(status.supported, true);
  assert.equal(status.applied, false);
  assert.equal(status.message, 'Windows did not register the login item.');
}

function testDefaultIsOff() {
  const availability = describeLoginItemAvailability({
    platform: 'win32',
    isPackaged: true,
    env: {}
  });
  assert.equal(availability.supported, true);

  const { controller } = createController();
  const status = controller.getControl();
  assert.equal(status.openAtLogin, false);
  assert.equal(status.applied, false);
  assert.equal(status.message, '');
}

function run() {
  testSetupRegistersOpenAtLogin();
  testPortableDoesNotRegister();
  testNpmStartDoesNotRegister();
  testSmokeDoesNotRegister();
  testNonWindowsPackagedDoesNotRegister();
  testFailedSetShowsError();
  testDefaultIsOff();
  console.log('login-item checks passed');
}

run();
