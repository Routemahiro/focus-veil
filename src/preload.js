const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('focusVeil', {
  version: '0.1.0',
  getMainState: () => ipcRenderer.invoke('focus-veil:get-main-state'),
  setOperationMode: (enabled) =>
    ipcRenderer.invoke('focus-veil:set-operation-mode', Boolean(enabled)),
  getCaptureSource: () => ipcRenderer.invoke('focus-veil:get-capture-source'),
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
  }
});
