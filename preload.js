const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDrives: () => ipcRenderer.invoke('get-drives'),
  wipeDrive: (drive, filesystem, method, customPasses) => ipcRenderer.invoke('wipe-drive', drive, filesystem, method, customPasses),
  showWarning: () => ipcRenderer.invoke('show-warning'),
  selectFilesystem: () => ipcRenderer.invoke('select-filesystem'),
  openLogs: () => ipcRenderer.invoke('open-logs'),
  getLogContent: () => ipcRenderer.invoke('get-log-content'),
  getSmartData: (drive) => ipcRenderer.invoke('get-smart-data', drive),
  generateCertificate: (selectedDrives) => ipcRenderer.invoke('generate-certificate', selectedDrives),
  exportLogs: () => ipcRenderer.invoke('export-logs'),
  sendEmailReport: (email) => ipcRenderer.invoke('send-email-report', email),
  showBackupWarning: () => ipcRenderer.invoke('show-backup-warning'),
  showCloneWarning: () => ipcRenderer.invoke('show-clone-warning'),
  selectCloneTarget: () => ipcRenderer.invoke('select-clone-target'),
  cloneDrive: (drive, targetPath) => ipcRenderer.invoke('clone-drive', drive, targetPath),
  pauseWipe: () => ipcRenderer.invoke('pause-wipe'),
  resumeWipe: () => ipcRenderer.invoke('resume-wipe'),
  cancelWipe: () => ipcRenderer.invoke('cancel-wipe'),
  onWipeProgress: (callback) => ipcRenderer.on('wipe-progress', callback),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', callback),
  onNewLog: (callback) => ipcRenderer.on('new-log', callback)
});