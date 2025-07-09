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
}

let mainWindow;
let isWiping = false;

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
    
    const allFilesystems = [];
    let totalUsedSpace = 0;
    let totalFreeSpace = 0;
    
    partLines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const filesystem = parts[1] || 'Unknown';
        const freeSpace = parseInt(parts[2]) || 0;
        const totalSize = parseInt(parts[3]) || 0;
        
        allFilesystems.push(filesystem);
        totalFreeSpace += freeSpace;
        totalUsedSpace += (totalSize - freeSpace);
      }
    });
    
    const uniqueFilesystems = [...new Set(allFilesystems)];
    
    return diskLines.map(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const index = parts[0];
        const model = parts.slice(1, -1).join(' ');
        const size = parseInt(parts[parts.length - 1]) || 0;
        
        const isSystemDisk = index === '0';
        
        return {
          drive: `Disk ${index}${isSystemDisk ? ' (System Disk)' : ''}`,
          model: model || 'Unknown',
          totalSize: size,
          usedSpace: size - totalFreeSpace,
          freeSpace: totalFreeSpace,
          diskIndex: index,
          filesystems: uniqueFilesystems.length > 0 ? uniqueFilesystems : ['Unknown'],
          isSystemDisk: isSystemDisk
        };
      }
    }).filter(Boolean).sort((a, b) => parseInt(a.diskIndex) - parseInt(b.diskIndex));
  } catch (error) {
    throw new Error('Failed to get drives: ' + error.message);
  }
});

// Secure wipe drive using cipher command
ipcMain.handle('wipe-drive', async (event, driveLetter, filesystem) => {
  return new Promise((resolve, reject) => {
    log(`Received drive parameter: ${driveLetter}`);
    // Extract just the number from "Disk 7" format
    const drive = driveLetter.replace('Disk ', '').replace(':', '');
    log(`Processed drive parameter: ${drive}`);
    const passes = 4; // 3 cipher passes + 1 format
    let currentPass = 0;

    isWiping = true;
    
    function performPass() {
      if (currentPass >= passes) {
        isWiping = false;
        resolve({ success: true, message: 'Drive wiped successfully' });
        return;
      }

      event.sender.send('wipe-progress', {
        pass: currentPass + 1,
        totalPasses: passes,
        progress: 0
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
      
      process.stdout.on('data', (data) => {
        log(`stdout: ${data.toString().trim()}`);
      });
      
      process.stderr.on('data', (data) => {
        log(`stderr: ${data.toString().trim()}`);
      });
      
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress = Math.min(progress + 10, 90);
        event.sender.send('wipe-progress', {
          pass: currentPass + 1,
          totalPasses: passes,
          progress
        });
      }, 2000);

      process.on('close', (code) => {
        clearInterval(progressInterval);
        
        if (code === 0) {
          event.sender.send('wipe-progress', {
            pass: currentPass + 1,
            totalPasses: passes,
            progress: 100
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

function createWipeScript(diskIndex, pass) {
  const scriptPath = path.join(os.tmpdir(), `wipe_${diskIndex}_${pass}.txt`);
  const script = `select disk ${diskIndex}\r\nclean\r\nexit\r\n`;
  fs.writeFileSync(scriptPath, script);
  return scriptPath;
}

function createFormatScript(diskIndex, filesystem) {
  const scriptPath = path.join(os.tmpdir(), `format_${diskIndex}.txt`);
  const script = `select disk ${diskIndex}\r\nclean\r\ncreate partition primary\r\nactive\r\nformat fs=${filesystem.toLowerCase()} quick\r\nassign\r\nexit\r\n`;
  fs.writeFileSync(scriptPath, script);
  return scriptPath;
}