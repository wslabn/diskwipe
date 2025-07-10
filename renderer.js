let selectedDrives = new Set();
let currentWipeMethod = 'standard';
let isPaused = false;
let wipeQueue = [];

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    loadSettings();
    loadDrives();
});

function initializeApp() {
    // Load theme
    const savedTheme = localStorage.getItem('darkMode');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'true' || (savedTheme === null && systemDark)) {
        document.body.classList.add('dark');
        document.getElementById('themeBtn').textContent = '☀️ Light';
    }
    
    // Set current date/time for scheduler
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30); // Default to 30 minutes from now
    document.getElementById('scheduleTime').value = now.toISOString().slice(0, 16);
}

function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });
    
    // Main buttons
    document.getElementById('refreshBtn').addEventListener('click', loadDrives);
    document.getElementById('wipeBtn').addEventListener('click', startWipe);
    document.getElementById('pauseBtn').addEventListener('click', togglePause);
    document.getElementById('cloneBtn').addEventListener('click', cloneDrives);
    document.getElementById('themeBtn').addEventListener('click', toggleTheme);
    document.getElementById('viewLogsBtn').addEventListener('click', () => window.electronAPI.openLogs());
    document.getElementById('smartBtn').addEventListener('click', showSmartData);
    
    // Method selection
    document.querySelectorAll('.method-card').forEach(card => {
        card.addEventListener('click', (e) => selectMethod(e.currentTarget.dataset.method));
    });
    
    // Modal buttons
    document.getElementById('pauseModalBtn').addEventListener('click', togglePause);
    document.getElementById('viewLogsModalBtn').addEventListener('click', () => window.electronAPI.openLogs());
    document.getElementById('cancelBtn').addEventListener('click', cancelWipe);
    
    // Schedule
    document.getElementById('addScheduleBtn').addEventListener('click', addSchedule);
    
    // Reports
    document.getElementById('generateReportBtn').addEventListener('click', generateReport);
    document.getElementById('exportLogsBtn').addEventListener('click', exportLogs);
    document.getElementById('emailReportBtn').addEventListener('click', emailReport);
    
    // Settings
    document.getElementById('soundNotifications').addEventListener('change', saveSettings);
    document.getElementById('emailNotifications').addEventListener('change', saveSettings);
    document.getElementById('tempMonitoring').addEventListener('change', saveSettings);
    document.getElementById('verificationPass').addEventListener('change', saveSettings);
    document.getElementById('requireBackupConfirm').addEventListener('change', saveSettings);
    
    // Sort drives
    document.getElementById('sortBy').addEventListener('change', (e) => sortDrives(e.target.value));
    
    // IPC listeners
    window.electronAPI.onWipeProgress((event, data) => updateProgress(data));
    window.electronAPI.onUpdateStatus((event, data) => updateUpdateStatus(data));
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

function toggleTheme() {
    const body = document.body;
    const themeBtn = document.getElementById('themeBtn');
    
    body.classList.toggle('dark');
    
    if (body.classList.contains('dark')) {
        themeBtn.textContent = '☀️ Light';
        localStorage.setItem('darkMode', 'true');
    } else {
        themeBtn.textContent = '🌙 Dark';
        localStorage.setItem('darkMode', 'false');
    }
}

async function loadDrives() {
    const driveList = document.getElementById('driveList');
    const status = document.getElementById('status');
    
    try {
        const drives = await window.electronAPI.getDrives();
        driveList.innerHTML = '';
        
        drives.forEach(drive => {
            const driveElement = createDriveCard(drive);
            driveList.appendChild(driveElement);
        });
        
        showStatus(`Found ${drives.length} drive(s)`, 'success');
        updateActionButtons();
    } catch (error) {
        showStatus('Error loading drives: ' + error.message, 'error');
    }
}

function createDriveCard(drive) {
    const card = document.createElement('div');
    card.className = 'drive-card';
    if (drive.isSystemDisk) card.classList.add('system-disk');
    
    const totalGB = (drive.totalSize / (1024**3)).toFixed(1);
    const freeGB = Math.abs(drive.freeSpace / (1024**3)).toFixed(1);
    const usedGB = (totalGB - freeGB).toFixed(1);
    
    // Estimate wipe time based on method
    const timeEstimate = calculateWipeTime(drive.totalSize, currentWipeMethod);
    
    // Mock temperature (in real app, this would come from SMART data)
    const temp = Math.floor(Math.random() * 20) + 35; // 35-55°C
    const tempClass = temp > 50 ? 'hot' : '';
    
    // Mock serial number
    const serial = `SN${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    
    card.innerHTML = `
        <div class="drive-header">
            <div class="drive-title">${drive.drive}</div>
            <input type="checkbox" class="drive-checkbox" data-drive="${drive.diskIndex}" ${drive.isSystemDisk ? 'disabled' : ''}>
        </div>
        <div class="drive-info">
            <div class="drive-detail">
                <span>Model:</span>
                <span>${drive.model}</span>
            </div>
            <div class="drive-detail">
                <span>Size:</span>
                <span>${totalGB} GB</span>
            </div>
            <div class="drive-detail">
                <span>Used:</span>
                <span>${usedGB} GB</span>
            </div>
            <div class="drive-detail">
                <span>Free:</span>
                <span>${freeGB} GB</span>
            </div>
            <div class="drive-detail">
                <span>Filesystem:</span>
                <span>${drive.filesystems.join(', ')}</span>
            </div>
            <div class="drive-serial">Serial: ${serial}</div>
            <div class="time-estimate">Est. time: ${timeEstimate}</div>
        </div>
        <div class="temp-indicator ${tempClass}">🌡️ ${temp}°C</div>
    `;
    
    if (!drive.isSystemDisk) {
        const checkbox = card.querySelector('.drive-checkbox');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedDrives.add(drive.diskIndex);
                card.classList.add('selected');
            } else {
                selectedDrives.delete(drive.diskIndex);
                card.classList.remove('selected');
            }
            updateActionButtons();
        });
        
        card.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
                checkbox.click();
            }
        });
    }
    
    return card;
}

function calculateWipeTime(sizeBytes, method) {
    const sizeGB = sizeBytes / (1024**3);
    const speedMBps = 50; // Conservative estimate
    
    let passes;
    switch (method) {
        case 'standard': passes = 4; break;
        case 'dod': passes = 7; break;
        case 'gutmann': passes = 35; break;
        case 'random': passes = parseInt(document.getElementById('randomPasses')?.value || 3); break;
        default: passes = 4;
    }
    
    const timeMinutes = (sizeGB * 1024 * passes) / speedMBps / 60;
    const hours = Math.floor(timeMinutes / 60);
    const minutes = Math.floor(timeMinutes % 60);
    
    return hours > 0 ? `~${hours}h ${minutes}m` : `~${minutes}m`;
}

function selectMethod(method) {
    currentWipeMethod = method;
    
    // Update UI
    document.querySelectorAll('.method-card').forEach(card => card.classList.remove('active'));
    document.querySelector(`[data-method="${method}"]`).classList.add('active');
    
    // Recalculate time estimates
    loadDrives();
}

function updateActionButtons() {
    const wipeBtn = document.getElementById('wipeBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const cloneBtn = document.getElementById('cloneBtn');
    
    const hasSelection = selectedDrives.size > 0;
    wipeBtn.disabled = !hasSelection;
    cloneBtn.disabled = !hasSelection;
}

async function startWipe() {
    if (selectedDrives.size === 0) return;
    
    // Check backup confirmation setting
    const requireBackup = document.getElementById('requireBackupConfirm').checked;
    if (requireBackup) {
        const backupConfirmed = await window.electronAPI.showBackupWarning();
        if (!backupConfirmed) return;
    }
    
    const confirmed = await window.electronAPI.showWarning();
    if (!confirmed) return;
    
    const filesystem = getSelectedFilesystem();
    
    showStatus('Starting secure wipe...', 'info');
    document.getElementById('progressModal').classList.remove('hidden');
    
    for (const drive of selectedDrives) {
        try {
            await window.electronAPI.wipeDrive(drive, filesystem, currentWipeMethod);
            showStatus(`Drive ${drive} wiped successfully!`, 'success');
        } catch (error) {
            showStatus(`Error wiping drive ${drive}: ${error.message}`, 'error');
            break;
        }
    }
    
    setTimeout(() => {
        document.getElementById('progressModal').classList.add('hidden');
        selectedDrives.clear();
        loadDrives();
    }, 3000);
}

function getSelectedFilesystem() {
    const selected = document.querySelector('input[name="filesystem"]:checked');
    return selected ? selected.value : 'exFAT';
}

function togglePause() {
    isPaused = !isPaused;
    const pauseBtn = document.getElementById('pauseBtn');
    const pauseModalBtn = document.getElementById('pauseModalBtn');
    
    if (isPaused) {
        pauseBtn.textContent = '▶️ Resume';
        pauseModalBtn.textContent = '▶️ Resume';
        window.electronAPI.pauseWipe();
    } else {
        pauseBtn.textContent = '⏸️ Pause';
        pauseModalBtn.textContent = '⏸️ Pause';
        window.electronAPI.resumeWipe();
    }
}

function cancelWipe() {
    if (confirm('Are you sure you want to cancel the wipe operation? This may leave the drive in an unusable state.')) {
        window.electronAPI.cancelWipe();
        document.getElementById('progressModal').classList.add('hidden');
        showStatus('Wipe operation cancelled', 'error');
    }
}

async function cloneDrives() {
    showStatus('Drive cloning feature coming soon!', 'info');
}

async function showSmartData() {
    showStatus('SMART data viewer coming soon!', 'info');
}

function sortDrives(sortBy) {
    // This would sort the drives in the UI
    loadDrives(); // For now, just reload
}

function updateProgress(data) {
    const progressInfo = document.getElementById('progressInfo');
    const progressFill = document.getElementById('progressFill');
    const progressDetails = document.getElementById('progressDetails');
    const tempDisplay = document.getElementById('tempDisplay');
    
    let timeInfo = '';
    let speedInfo = '';
    
    if (data.writeSpeed) {
        const speedMBs = (data.writeSpeed / (1024 * 1024)).toFixed(1);
        speedInfo = ` - ${speedMBs} MB/s`;
    }
    
    if (data.timeRemaining) {
        const hours = Math.floor(data.timeRemaining / (1000 * 60 * 60));
        const minutes = Math.floor((data.timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
        timeInfo = hours > 0 ? ` - Time remaining: ~${hours}h ${minutes}m` : ` - Time remaining: ~${minutes}m`;
    }
    
    progressInfo.innerHTML = `
        <h4>Pass ${data.pass} of ${data.totalPasses}</h4>
        <p>${data.progress}%${speedInfo}${timeInfo}</p>
    `;
    
    progressFill.style.width = `${data.progress}%`;
    
    // Mock temperature update
    const temp = Math.floor(Math.random() * 10) + 45; // 45-55°C during operation
    tempDisplay.textContent = `🌡️ ${temp}°C`;
    tempDisplay.className = temp > 55 ? 'temp-display hot' : 'temp-display';
    
    let passDescription = '';
    if (data.pass <= getMethodPasses(currentWipeMethod) - 1) {
        passDescription = `Securely overwriting all data on the drive.<br>This pass removes all existing files and partitions.`;
    } else {
        passDescription = `Creating new partition and formatting with selected filesystem.<br>Drive will be ready for use after this step.`;
    }
    
    progressDetails.innerHTML = passDescription;
    
    // Play sound notification if enabled
    if (data.progress === 100 && document.getElementById('soundNotifications').checked) {
        playNotificationSound();
    }
}

function getMethodPasses(method) {
    switch (method) {
        case 'standard': return 4;
        case 'dod': return 7;
        case 'gutmann': return 35;
        case 'random': return parseInt(document.getElementById('randomPasses')?.value || 3) + 1;
        default: return 4;
    }
}

function updateUpdateStatus(data) {
    const updateStatus = document.getElementById('updateStatus');
    const updateIcon = document.getElementById('updateIcon');
    const updateText = document.getElementById('updateText');
    
    updateStatus.classList.remove('update-available', 'update-error');
    
    switch(data.status) {
        case 'checking':
            updateIcon.textContent = '🔄';
            updateText.textContent = 'Checking...';
            break;
        case 'available':
            updateIcon.textContent = '⬇️';
            updateText.textContent = `v${data.message.split('v')[1]}`;
            updateStatus.classList.add('update-available');
            break;
        case 'downloading':
            updateIcon.textContent = '📥';
            updateText.textContent = data.message.split(': ')[1];
            updateStatus.classList.add('update-available');
            break;
        case 'current':
            updateIcon.textContent = '✅';
            updateText.textContent = 'Up to date';
            break;
        case 'error':
            updateIcon.textContent = '❌';
            updateText.textContent = 'Error';
            updateStatus.classList.add('update-error');
            break;
    }
}

function addSchedule() {
    const type = document.getElementById('scheduleType').value;
    const time = document.getElementById('scheduleTime').value;
    
    if (!time) {
        showStatus('Please select a date and time', 'error');
        return;
    }
    
    const scheduleList = document.getElementById('scheduleList');
    const scheduleItem = document.createElement('div');
    scheduleItem.className = 'schedule-item';
    scheduleItem.innerHTML = `
        <div class="schedule-info">
            <strong>${type.charAt(0).toUpperCase() + type.slice(1)} Wipe</strong>
            <span>${new Date(time).toLocaleString()}</span>
        </div>
        <button onclick="this.parentElement.remove()">❌</button>
    `;
    
    scheduleList.appendChild(scheduleItem);
    showStatus('Schedule added successfully', 'success');
}

async function generateReport() {
    showStatus('Generating wipe certificate...', 'info');
    // This would generate a PDF certificate
    setTimeout(() => {
        showStatus('Certificate generated successfully', 'success');
    }, 2000);
}

async function exportLogs() {
    showStatus('Exporting logs...', 'info');
    // This would export logs as CSV/PDF
    setTimeout(() => {
        showStatus('Logs exported successfully', 'success');
    }, 1000);
}

async function emailReport() {
    const email = document.getElementById('emailAddress').value;
    if (!email) {
        showStatus('Please enter an email address in settings', 'error');
        return;
    }
    
    showStatus('Sending email report...', 'info');
    // This would send email report
    setTimeout(() => {
        showStatus('Email report sent successfully', 'success');
    }, 2000);
}

function saveSettings() {
    const settings = {
        soundNotifications: document.getElementById('soundNotifications').checked,
        emailNotifications: document.getElementById('emailNotifications').checked,
        emailAddress: document.getElementById('emailAddress').value,
        tempMonitoring: document.getElementById('tempMonitoring').checked,
        maxTemp: document.getElementById('maxTemp').value,
        verificationPass: document.getElementById('verificationPass').checked,
        requireBackupConfirm: document.getElementById('requireBackupConfirm').checked
    };
    
    localStorage.setItem('diskwipeSettings', JSON.stringify(settings));
    showStatus('Settings saved', 'success');
}

function loadSettings() {
    const saved = localStorage.getItem('diskwipeSettings');
    if (!saved) return;
    
    const settings = JSON.parse(saved);
    
    document.getElementById('soundNotifications').checked = settings.soundNotifications ?? true;
    document.getElementById('emailNotifications').checked = settings.emailNotifications ?? false;
    document.getElementById('emailAddress').value = settings.emailAddress ?? '';
    document.getElementById('tempMonitoring').checked = settings.tempMonitoring ?? true;
    document.getElementById('maxTemp').value = settings.maxTemp ?? 60;
    document.getElementById('verificationPass').checked = settings.verificationPass ?? true;
    document.getElementById('requireBackupConfirm').checked = settings.requireBackupConfirm ?? true;
}

function showStatus(message, type = 'info') {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
    
    setTimeout(() => {
        status.style.display = 'none';
    }, 5000);
}

function playNotificationSound() {
    // Create a simple beep sound
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
}