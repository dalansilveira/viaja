// preload-splash.js
const { contextBridge, ipcRenderer } = require('electron');

// Expõe uma API segura para a janela de splash poder ouvir eventos
contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (_event, value) => callback(value))
});