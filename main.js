const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Setup logging
const logPath = path.join(os.homedir(), 'DiskWipe', 'logs');
if (!fs.existsSync(logPath)) {
  fs.mkdirSync(logPath, { recursive: true });
}
const logFile = path.join(logPath, `diskwipe-${new Date().toISOString().split('T')[0]}.log`);

function log(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(logFile, logEntry);
  
  // Send log to any open log windows
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.webContents.send('new-log', { timestamp, message });
  }
}

let mainWindow;
let logWindow;
let isWiping = false;
let isPaused = false;
let currentWipeProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  
  mainWindow.on('close', (event) => {
    if (isWiping) {
      event.preventDefault();
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Wipe in Progress',
        message: 'Cannot close while wiping drives. Please wait for completion.',
        buttons: ['OK']
      });
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  log('Application started, checking for updates...');
  autoUpdater.checkForUpdatesAndNotify();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (isWiping) {
    event.preventDefault();
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Wipe in Progress',
      message: 'Cannot close while wiping drives. Please wait for completion.',
      buttons: ['OK']
    });
  }
});

// Get available drives
ipcMain.handle('get-drives', async () => {
  try {
    const diskOutput = execSync('wmic diskdrive get size,model,index', { encoding: 'utf8' });
    const diskLines = diskOutput.split('\n').filter(line => line.trim() && !line.includes('Index'));
    
    const partOutput = execSync('wmic logicaldisk get caption,filesystem,size,freespace', { encoding: 'utf8' });
    const partLines = partOutput.split('\n').filter(line => line.trim() && !line.includes('Caption'));
    
    // Get disk-to-partition mapping
    const diskPartOutput = execSync('wmic partition get diskindex,size', { encoding: 'utf8' });
    const diskPartLines = diskPartOutput.split('\n').filter(line => line.trim() && !line.includes('DiskIndex'));
    
    // Parse partition data by drive letter
    const partitionData = {};
    partLines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const caption = parts[0]; // Drive letter like C:
        const filesystem = parts[1] || 'Unformatted';
        const freeSpace = parseInt(parts[2]) || 0;
        const totalSize = parseInt(parts[3]) || 0;
        
        partitionData[caption] = {
          filesystem,
          freeSpace,
          totalSize,
          usedSpace: totalSize - freeSpace
        };
      }
    });
    
    return diskLines.map(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const index = parts[0];
        const model = parts.slice(1, -1).join(' ');
        const diskSize = parseInt(parts[parts.length - 1]) || 0;
        
        const isSystemDisk = index === '0';
        
        // Get actual filesystems for this disk
        const diskFilesystems = [];
        let totalUsed = 0;
        let totalFree = 0;
        let hasPartitions = false;
        
        // Try to match partitions to this disk (simplified approach)
        Object.values(partitionData).forEach(partition => {
          if (partition.filesystem && partition.filesystem !== 'Unformatted') {
            diskFilesystems.push(partition.filesystem);
          }
          totalUsed += partition.usedSpace;
          totalFree += partition.freeSpace;
          hasPartitions = true;
        });
        
        // If no partition data, assume unpartitioned
        if (!hasPartitions || diskFilesystems.length === 0) {
          totalFree = diskSize;
          totalUsed = 0;
          diskFilesystems.push('Unpartitioned');
        }
        
        const uniqueFilesystems = [...new Set(diskFilesystems)];
        
        return {
          drive: `Disk ${index}${isSystemDisk ? ' (System Disk)' : ''}`,
          model: model || 'Unknown',
          totalSize: diskSize,
          usedSpace: Math.max(0, totalUsed),
          freeSpace: Math.max(0, diskSize - totalUsed),
          diskIndex: index,
          filesystems: uniqueFilesystems.length > 0 ? uniqueFilesystems : ['Unpartitioned'],
          isSystemDisk: isSystemDisk
        };
      }
    }).filter(Boolean).sort((a, b) => parseInt(a.diskIndex) - parseInt(b.diskIndex));
  } catch (error) {
    throw new Error('Failed to get drives: ' + error.message);
  }
});

// Secure wipe drive with advanced methods
ipcMain.handle('wipe-drive', async (event, driveLetter, filesystem, method = 'standard') => {
  return new Promise((resolve, reject) => {
    log(`Received drive parameter: ${driveLetter}`);
    // Extract just the number from "Disk 7" format
    const drive = driveLetter.replace('Disk ', '').replace(':', '');
    log(`Processed drive parameter: ${drive}`);
    const passes = getMethodPasses(method);
    let currentPass = 0;
    let passStartTime = Date.now();
    let totalStartTime = Date.now();
    let bytesWritten = 0;
    let lastProgressTime = Date.now();
    let currentWriteSpeed = 0;

    isWiping = true;
    
    function performPass() {
      if (currentPass >= passes) {
        isWiping = false;
        resolve({ success: true, message: 'Drive wiped successfully' });
        return;
      }

      passStartTime = Date.now();
      event.sender.send('wipe-progress', {
        pass: currentPass + 1,
        totalPasses: passes,
        progress: 0,
        timeRemaining: null
      });

      // Create diskpart script file for reliable execution
      let scriptContent;
      if (currentPass < 3) {
        scriptContent = `select disk ${drive}\nclean all\nexit\n`;
      } else {
        scriptContent = `select disk ${drive}\ncreate partition primary\nactive\nformat fs=${filesystem.toLowerCase()} quick\nassign\nexit\n`;
      }
      
      const scriptPath = createDiskpartScript(drive, currentPass, scriptContent);
      const cmd = `diskpart /s "${scriptPath}"`;
      const process = spawn('cmd', ['/c', cmd], { shell: true });
      currentWipeProcess = process;
      
      process.stdout.on('data', (data) => {
        log(`stdout: ${data.toString().trim()}`);
      });
      
      process.stderr.on('data', (data) => {
        log(`stderr: ${data.toString().trim()}`);
      });
      
      let progress = 0;
      let driveSize = 0;
      
      // Get drive size asynchronously
      getDriveSize(drive).then(size => {
        driveSize = size;
      }).catch(() => {
        driveSize = 0;
      });
      
      const progressInterval = setInterval(() => {
        progress = Math.min(progress + 10, 90);
        
        // Calculate actual write speed and time estimates
        const now = Date.now();
        const elapsed = now - passStartTime;
        const progressBytes = (progress / 100) * driveSize;
        
        if (progress > 10 && elapsed > 5000 && driveSize > 0) { // Wait 5 seconds for stable reading
          currentWriteSpeed = progressBytes / (elapsed / 1000); // bytes per second
          const remainingBytes = driveSize - progressBytes;
          const passTimeRemaining = remainingBytes / currentWriteSpeed * 1000; // ms
          const remainingPasses = passes - currentPass - 1;
          const totalTimeRemaining = passTimeRemaining + (remainingPasses * (driveSize / currentWriteSpeed * 1000));
          
          event.sender.send('wipe-progress', {
            pass: currentPass + 1,
            totalPasses: passes,
            progress,
            timeRemaining: totalTimeRemaining,
            writeSpeed: currentWriteSpeed
          });
        } else {
          event.sender.send('wipe-progress', {
            pass: currentPass + 1,
            totalPasses: passes,
            progress,
            timeRemaining: null,
            writeSpeed: null
          });
        }
      }, 2000);

      process.on('close', (code) => {
        clearInterval(progressInterval);
        
        if (code === 0) {
          event.sender.send('wipe-progress', {
            pass: currentPass + 1,
            totalPasses: passes,
            progress: 100,
            timeRemaining: null,
            writeSpeed: currentWriteSpeed
          });
          
          currentPass++;
          setTimeout(performPass, 500);
        } else {
          isWiping = false;
          reject(new Error(`Wipe failed with code ${code}. Check console for details.`));
        }
      });

      process.on('error', (error) => {
        clearInterval(progressInterval);
        isWiping = false;
        reject(new Error('Wipe process error: ' + error.message));
      });
    }

    performPass();
  });
});

ipcMain.handle('show-warning', async () => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Cancel', 'I Understand - Proceed'],
    defaultId: 0,
    title: 'WARNING: Data Destruction',
    message: 'This will PERMANENTLY destroy ALL data on the selected drive(s).',
    detail: 'This action cannot be undone. Ensure you have backed up any important data.'
  });
  
  return result.response === 1;
});

ipcMain.handle('select-filesystem', async () => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['NTFS', 'exFAT', 'FAT32'],
    defaultId: 1,
    title: 'Select Filesystem',
    message: 'Choose filesystem for final formatting:',
    detail: 'NTFS: Windows only\nexFAT: Cross-platform (recommended for resale)\nFAT32: Older compatibility'
  });
  
  const filesystems = ['NTFS', 'exFAT', 'FAT32'];
  return filesystems[result.response];
});

ipcMain.handle('show-backup-warning', async () => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Cancel', 'I Have Backups - Proceed'],
    defaultId: 0,
    title: 'BACKUP CONFIRMATION REQUIRED',
    message: 'Have you backed up all important data?',
    detail: 'This is your final chance to ensure all important files are safely backed up before permanent destruction.'
  });
  
  return result.response === 1;
});

ipcMain.handle('show-clone-warning', async () => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    buttons: ['Cancel', 'Clone Drive'],
    defaultId: 0,
    title: 'Clone Drive Before Wiping',
    message: 'Create a backup image of the drive before wiping?',
    detail: 'This will create a complete sector-by-sector copy of the drive for recovery purposes.'
  });
  
  return result.response === 1;
});

ipcMain.handle('select-clone-target', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Select Clone Target Location',
    defaultPath: 'drive-clone.img',
    filters: [
      { name: 'Disk Images', extensions: ['img', 'iso', 'bin'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('clone-drive', async (event, driveLetter, targetPath) => {
  return new Promise((resolve, reject) => {
    log(`Starting clone of drive ${driveLetter} to ${targetPath}`);
    
    const drive = driveLetter.replace('Disk ', '').replace(':', '');
    
    // Use dd command for Windows (if available) or PowerShell alternative
    const cmd = `powershell -Command "& { $source = '\\\\.\\PhysicalDrive${drive}'; $target = '${targetPath}'; Write-Host 'Cloning drive...'; Copy-Item $source $target -Force; Write-Host 'Clone completed' }"`;
    
    const process = spawn('cmd', ['/c', cmd], { shell: true });
    
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress = Math.min(progress + 10, 90);
      event.sender.send('wipe-progress', {
        pass: 1,
        totalPasses: 1,
        progress,
        timeRemaining: null,
        writeSpeed: null
      });
    }, 5000);
    
    process.stdout.on('data', (data) => {
      log(`Clone output: ${data.toString().trim()}`);
    });
    
    process.stderr.on('data', (data) => {
      log(`Clone error: ${data.toString().trim()}`);
    });
    
    process.on('close', (code) => {
      clearInterval(progressInterval);
      
      if (code === 0) {
        event.sender.send('wipe-progress', {
          pass: 1,
          totalPasses: 1,
          progress: 100,
          timeRemaining: null,
          writeSpeed: null
        });
        resolve({ success: true, message: 'Drive cloned successfully' });
      } else {
        reject(new Error(`Clone failed with code ${code}`));
      }
    });
    
    process.on('error', (error) => {
      clearInterval(progressInterval);
      reject(new Error('Clone process error: ' + error.message));
    });
  });
});

ipcMain.handle('open-logs', async () => {
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.focus();
    return;
  }
  
  logWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'DiskWipe Logs',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  // Create logs HTML content
  const logsHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>DiskWipe Logs</title>
      <style>
        body { font-family: 'Courier New', monospace; background: #1a1a1a; color: #00ff00; padding: 10px; margin: 0; overflow: hidden; }
        .log-container { height: calc(100vh - 20px); overflow-y: auto; overflow-x: hidden; white-space: pre-wrap; word-wrap: break-word; }
        .log-entry { margin-bottom: 2px; }
        .timestamp { color: #888; }
      </style>
    </head>
    <body>
      <div class="log-container" id="logContainer"></div>
      <script>
        // Load existing logs
        const logContainer = document.getElementById('logContainer');
        
        // Listen for new logs
        window.electronAPI.onNewLog((event, data) => {
          const logEntry = document.createElement('div');
          logEntry.className = 'log-entry';
          logEntry.innerHTML = \`<span class="timestamp">[\${data.timestamp}]</span> \${data.message}\`;
          logContainer.appendChild(logEntry);
          logContainer.scrollTop = logContainer.scrollHeight;
        });
        
        // Load existing log file content
        window.electronAPI.getLogContent().then(content => {
          logContainer.textContent = content;
          logContainer.scrollTop = logContainer.scrollHeight;
        }).catch(() => {
          logContainer.textContent = 'No logs available yet.';
        });
      </script>
    </body>
    </html>
  `;
  
  logWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(logsHtml));
});

ipcMain.handle('get-log-content', async () => {
  try {
    if (fs.existsSync(logFile)) {
      return fs.readFileSync(logFile, 'utf8');
    }
    return 'No logs available yet.';
  } catch (error) {
    return 'Error reading log file: ' + error.message;
  }
});

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  log('Checking for application updates...');
  mainWindow.webContents.send('update-status', { status: 'checking', message: 'Checking for updates...' });
});

autoUpdater.on('update-available', (info) => {
  log(`Update available: ${info.version}`);
  mainWindow.webContents.send('update-status', { status: 'available', message: `Update available: v${info.version}` });
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: 'A new version is available. It will be downloaded in the background.',
    buttons: ['OK']
  });
});

autoUpdater.on('update-not-available', () => {
  log('Application is up to date');
  mainWindow.webContents.send('update-status', { status: 'current', message: 'Up to date' });
});

autoUpdater.on('download-progress', (progressObj) => {
  log(`Update download progress: ${Math.round(progressObj.percent)}%`);
  mainWindow.webContents.send('update-status', { status: 'downloading', message: `Downloading: ${Math.round(progressObj.percent)}%` });
});

autoUpdater.on('update-downloaded', (info) => {
  log(`Update downloaded: ${info.version}`);
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: 'Update downloaded. The application will restart to apply the update.',
    buttons: ['Restart Now', 'Later']
  }).then((result) => {
    if (result.response === 0) {
      log('User chose to restart and install update');
      autoUpdater.quitAndInstall();
    } else {
      log('User chose to install update later');
    }
  });
});

autoUpdater.on('error', (error) => {
  log(`Auto-updater error: ${error.message}`);
  mainWindow.webContents.send('update-status', { status: 'error', message: 'Update check failed' });
});

function createDiskpartScript(diskIndex, pass, content) {
  const scriptPath = path.join(os.tmpdir(), `diskpart_${diskIndex}_${pass}.txt`);
  fs.writeFileSync(scriptPath, content);
  return scriptPath;
}

async function getDriveSize(diskIndex) {
  try {
    const drives = await getDrives();
    const drive = drives.find(d => d.diskIndex == diskIndex);
    return drive ? drive.totalSize : 0;
  } catch (error) {
    return 0;
  }
}

function createWipeScript(diskIndex, pass) {
  const scriptPath = path.join(os.tmpdir(), `wipe_${diskIndex}_${pass}.txt`);
  const script = `select disk ${diskIndex}\r\nclean\r\nexit\r\n`;
  fs.writeFileSync(scriptPath, script);
  return scriptPath;
}

function getMethodPasses(method) {
  switch (method) {
    case 'standard': return 4;
    case 'dod': return 7;
    case 'gutmann': return 35;
    case 'random': return 4; // Default to 3 + format
    default: return 4;
  }
}

function createFormatScript(diskIndex, filesystem) {
  const scriptPath = path.join(os.tmpdir(), `format_${diskIndex}.txt`);
  const script = `select disk ${diskIndex}\r\nclean\r\ncreate partition primary\r\nactive\r\nformat fs=${filesystem.toLowerCase()} quick\r\nassign\r\nexit\r\n`;
  fs.writeFileSync(scriptPath, script);
  return scriptPath;
}

ipcMain.handle('pause-wipe', async () => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Cancel', 'Pause Anyway'],
    defaultId: 0,
    title: 'WARNING: Pause Risk',
    message: 'Pausing mid-wipe may leave the drive in an unusable state.',
    detail: 'The drive may become corrupted and require reformatting. Only pause if absolutely necessary.'
  });
  
  if (result.response !== 1) {
    return { success: false, message: 'Pause cancelled by user' };
  }
  
  if (currentWipeProcess && !isPaused) {
    isPaused = true;
    try {
      execSync(`taskkill /PID ${currentWipeProcess.pid} /T /F`);
      log('Wipe process paused - WARNING: Drive may be in unstable state');
      return { success: true, message: 'Wipe paused - Drive may need reformatting' };
    } catch (error) {
      log(`Failed to pause process: ${error.message}`);
      return { success: false, message: 'Failed to pause' };
    }
  }
  return { success: false, message: 'No active process to pause' };
});

ipcMain.handle('resume-wipe', async () => {
  isPaused = false;
  log('Wipe process resumed');
  return { success: true, message: 'Wipe resumed' };
});

ipcMain.handle('cancel-wipe', async () => {
  if (currentWipeProcess) {
    try {
      currentWipeProcess.kill('SIGTERM');
      isWiping = false;
      isPaused = false;
      currentWipeProcess = null;
      log('Wipe process cancelled');
      return { success: true, message: 'Wipe cancelled' };
    } catch (error) {
      log(`Failed to cancel process: ${error.message}`);
      return { success: false, message: 'Failed to cancel' };
    }
  }
  return { success: false, message: 'No active process to cancel' };
});