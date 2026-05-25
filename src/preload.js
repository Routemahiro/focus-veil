const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('focusVeil', {
  version: '0.1.0'
});
