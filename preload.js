const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDrives: () => ipcRenderer.invoke('get-drives'),
  wipeDrive: (drive, filesystem) => ipcRenderer.invoke('wipe-drive', drive, filesystem),
  showWarning: () => ipcRenderer.invoke('show-warning'),
  selectFilesystem: () => ipcRenderer.invoke('select-filesystem'),
  onWipeProgress: (callback) => ipcRenderer.on('wipe-progress', callback)
});