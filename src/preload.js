const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('focusVeil', {
  version: '0.1.2',
  getMainState: () => ipcRenderer.invoke('focus-veil:get-main-state'),
  setOperationMode: (enabled) =>
    ipcRenderer.invoke('focus-veil:set-operation-mode', Boolean(enabled)),
  notifyCursorActivity: () => ipcRenderer.send('focus-veil:cursor-activity'),
  updateSettings: (patch) => ipcRenderer.invoke('focus-veil:update-settings', patch),
  timerCommand: (action) => ipcRenderer.invoke('focus-veil:timer-command', action),
  onOperationModeChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('focus-veil:operation-mode', listener);
    return () => ipcRenderer.removeListener('focus-veil:operation-mode', listener);
  },
  onTimerStateChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('focus-veil:timer-state', listener);
    return () => ipcRenderer.removeListener('focus-veil:timer-state', listener);
  },
  onSettingsChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('focus-veil:settings-state', listener);
    return () => ipcRenderer.removeListener('focus-veil:settings-state', listener);
  },
  onActiveDisplayChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('focus-veil:active-display', listener);
    return () => ipcRenderer.removeListener('focus-veil:active-display', listener);
  },
  onActiveWindowChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('focus-veil:active-window', listener);
    return () => ipcRenderer.removeListener('focus-veil:active-window', listener);
  }
});
