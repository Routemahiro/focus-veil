const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('focusVeil', {
  version: '0.1.0',
  getMainState: () => ipcRenderer.invoke('focus-veil:get-main-state'),
  setOperationMode: (enabled) =>
    ipcRenderer.invoke('focus-veil:set-operation-mode', Boolean(enabled)),
  onOperationModeChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('focus-veil:operation-mode', listener);
    return () => ipcRenderer.removeListener('focus-veil:operation-mode', listener);
  }
});
