let selectedDrives = new Set();

document.addEventListener('DOMContentLoaded', () => {
    loadDrives();
    
    document.getElementById('refreshBtn').addEventListener('click', loadDrives);
    document.getElementById('wipeBtn').addEventListener('click', startWipe);
    document.getElementById('themeBtn').addEventListener('click', toggleTheme);
    
    window.electronAPI.onWipeProgress((event, data) => {
        updateProgress(data);
    });
    
    window.electronAPI.onUpdateStatus((event, data) => {
        updateUpdateStatus(data);
    });
    
    // Load theme: saved preference or system default
    const savedTheme = localStorage.getItem('darkMode');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'true' || (savedTheme === null && systemDark)) {
        document.body.classList.add('dark');
        document.getElementById('themeBtn').textContent = '☀️ Light Mode';
    }
});

function toggleTheme() {
    const body = document.body;
    const themeBtn = document.getElementById('themeBtn');
    
    body.classList.toggle('dark');
    
    if (body.classList.contains('dark')) {
        themeBtn.textContent = '☀️ Light Mode';
        localStorage.setItem('darkMode', 'true');
    } else {
        themeBtn.textContent = '🌙 Dark Mode';
        localStorage.setItem('darkMode', 'false');
    }
}

function updateUpdateStatus(data) {
    const updateStatus = document.getElementById('updateStatus');
    const updateIcon = document.getElementById('updateIcon');
    const updateText = document.getElementById('updateText');
    
    // Remove existing status classes
    updateStatus.classList.remove('update-available', 'update-error');
    
    switch(data.status) {
        case 'checking':
            updateIcon.textContent = '🔄';
            break;
        case 'available':
            updateIcon.textContent = '⬇️';
            updateStatus.classList.add('update-available');
            break;
        case 'downloading':
            updateIcon.textContent = '📥';
            updateStatus.classList.add('update-available');
            break;
        case 'current':
            updateIcon.textContent = '✅';
            break;
        case 'error':
            updateIcon.textContent = '❌';
            updateStatus.classList.add('update-error');
            break;
    }
    
    updateText.textContent = data.message;
}

async function loadDrives() {
    const driveList = document.getElementById('driveList');
    const status = document.getElementById('status');
    
    try {
        const drives = await window.electronAPI.getDrives();
        driveList.innerHTML = '';
        
        drives.forEach(drive => {
            const driveElement = createDriveElement(drive);
            driveList.appendChild(driveElement);
        });
        
        status.textContent = `Found ${drives.length} drive(s)`;
        status.className = 'status';
    } catch (error) {
        status.textContent = 'Error loading drives: ' + error.message;
        status.className = 'status error';
    }
}

function createDriveElement(drive) {
    const div = document.createElement('div');
    div.className = 'drive-item';
    
    const totalGB = (drive.totalSize / (1024**3)).toFixed(1);
    const freeGB = Math.abs(drive.freeSpace / (1024**3)).toFixed(1);
    const usedGB = Math.abs(drive.usedSpace / (1024**3)).toFixed(1);
    const fsInfo = drive.filesystems.join(', ');
    
    div.innerHTML = `
        <input type="checkbox" class="drive-checkbox" data-drive="${drive.diskIndex}" ${drive.isSystemDisk ? 'disabled' : ''}>
        <div class="drive-info">
            <h3>${drive.drive}</h3>
            <p>${drive.model}</p>
            <p>${totalGB} GB (${freeGB} GB free) • ${fsInfo}</p>
        </div>
    `;
    
    if (drive.isSystemDisk) {
        div.classList.add('system-disk');
        div.style.opacity = '0.5';
        div.style.cursor = 'not-allowed';
    }
    
    const checkbox = div.querySelector('.drive-checkbox');
    checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            selectedDrives.add(drive.diskIndex);
            div.classList.add('selected');
        } else {
            selectedDrives.delete(drive.diskIndex);
            div.classList.remove('selected');
        }
        
        document.getElementById('wipeBtn').disabled = selectedDrives.size === 0;
    });
    
    return div;
}

async function startWipe() {
    if (selectedDrives.size === 0) return;
    
    const confirmed = await window.electronAPI.showWarning();
    if (!confirmed) return;
    
    const filesystem = await window.electronAPI.selectFilesystem();
    
    const wipeBtn = document.getElementById('wipeBtn');
    const progressModal = document.getElementById('progressModal');
    const status = document.getElementById('status');
    
    wipeBtn.disabled = true;
    status.textContent = 'Starting secure wipe...';
    status.className = 'status';
    
    for (const drive of selectedDrives) {
        try {
            // Show modal only when wiping actually starts
            progressModal.classList.remove('hidden');
            document.querySelector('.modal-content h3').textContent = `🔒 Wiping ${drive}`;
            status.textContent = `Wiping drive ${drive}...`;
            await window.electronAPI.wipeDrive(drive, filesystem);
            
            status.textContent = `Drive ${drive} wiped and formatted as ${filesystem}!`;
            status.className = 'status success';
        } catch (error) {
            status.textContent = `Error wiping drive ${drive}: ${error.message}`;
            status.className = 'status error';
            break;
        }
    }
    
    setTimeout(() => {
        document.getElementById('progressModal').classList.add('hidden');
        wipeBtn.disabled = false;
        selectedDrives.clear();
        loadDrives();
    }, 2000);
}

function updateProgress(data) {
    const progressInfo = document.getElementById('progressInfo');
    const progressFill = document.getElementById('progressFill');
    const progressDetails = document.getElementById('progressDetails');
    
    progressInfo.textContent = `Pass ${data.pass} of ${data.totalPasses} - ${data.progress}%`;
    progressFill.style.width = `${data.progress}%`;
    
    let passDescription = '';
    if (data.pass <= 3) {
        passDescription = `Securely overwriting all data on the drive.\nThis pass removes all existing files and partitions.`;
    } else {
        passDescription = `Creating new partition and formatting with selected filesystem.\nDrive will be ready for use after this step.`;
    }
    
    progressDetails.innerHTML = passDescription.replace('\n', '<br>');
}