const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDrives: () => ipcRenderer.invoke('get-drives'),
  wipeDrive: (drive, filesystem) => ipcRenderer.invoke('wipe-drive', drive, filesystem),
  showWarning: () => ipcRenderer.invoke('show-warning'),
  selectFilesystem: () => ipcRenderer.invoke('select-filesystem'),
  openLogs: () => ipcRenderer.invoke('open-logs'),
  getLogContent: () => ipcRenderer.invoke('get-log-content'),
  showBackupWarning: () => ipcRenderer.invoke('show-backup-warning'),
  pauseWipe: () => ipcRenderer.invoke('pause-wipe'),
  resumeWipe: () => ipcRenderer.invoke('resume-wipe'),
  cancelWipe: () => ipcRenderer.invoke('cancel-wipe'),
  onWipeProgress: (callback) => ipcRenderer.on('wipe-progress', callback),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', callback),
  onNewLog: (callback) => ipcRenderer.on('new-log', callback)
});