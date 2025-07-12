# DiskWipe - Secure Drive Wiping Utility

A secure Electron-based application for permanently wiping disk drives using multiple-pass overwriting.

## Features

### Core Wiping
- **Multiple wipe methods**: Standard (4-pass), DoD 5220.22-M (8-pass), Gutmann (36-pass), Custom Random
- **Real verification**: Confirms actual data destruction after each pass
- **Drive detection**: Automatically detects available physical drives with real serial numbers
- **Progress tracking**: Real-time progress with speed and time estimates
- **Safety warnings**: Multiple confirmations before destructive operations
- **System disk protection**: Prevents wiping of boot drive
- **Pause/Resume/Cancel**: Full control over wipe operations

### Drive Management
- **SMART data analysis**: Multi-drive health monitoring with temperature and status
- **Drive cloning**: Sector-by-sector backup before wiping (multi-drive support)
- **Drive sorting**: By index, size, or model
- **Real hardware info**: Actual serial numbers and model names

### Scheduling & Automation
- **Wipe scheduling**: Schedule wipes for future execution
- **Custom passes**: User-defined number of random overwrite passes
- **Filesystem selection**: NTFS, exFAT, FAT32 formatting options

### Reporting & Compliance
- **Individual certificates**: Separate certificates per drive for multiple owners
- **Clone tracking**: Documents if drives were backed up before wiping
- **Print preview**: Certificate preview window with print/copy functions
- **Detailed logging**: Enhanced logs with timing, verification, and patterns
- **Log rotation**: 10MB limit with automatic backup
- **CSV export**: Export logs for analysis

### User Interface
- **Loading states**: Visual feedback during drive scanning
- **Empty/Error states**: Helpful messages when no drives found
- **Dark/Light mode**: Follows system theme or manual toggle
- **Multi-drive selection**: Batch operations on multiple drives

### Updates
- **Auto-updates**: Installer version updates automatically
- **Portable notifications**: Portable version checks for updates and notifies user

## Installation

### Installer Version
- **Auto-updates**: Automatically downloads and installs updates
- **System integration**: Installed to Program Files
- Download: `DiskWipe-Setup-1.4.0.exe`

### Portable Version  
- **No installation**: Run from any location
- **Update notifications**: Alerts when new versions available
- **Self-contained**: No registry changes
- Download: `DiskWipe-Portable-1.4.0.exe`

Download the latest release from [Releases](https://github.com/wslabn/diskwipe/releases)

## Development

```bash
npm install
npm start
```

## Building

```bash
npm run build
```

## Version History

### v1.4.0 - Latest
- **Individual certificates** per drive for multiple owners
- **Multi-drive cloning** with separate image files
- **Enhanced SMART data** viewer for multiple drives
- **Working wipe methods** - all methods now functional
- **Real serial numbers** throughout application
- **Wipe verification** - confirms actual data destruction
- **Scheduling system** - schedule wipes for future execution
- **Log rotation** - 10MB limit prevents disk space issues
- **Loading states** - visual feedback during operations
- **Portable update notifications** - alerts for new versions
- **Clone tracking** in certificates
- **Print preview** for certificates
- **Pause state fixes** and improved error handling

## Deployment Steps

1. Update version in `package.json`
2. Commit changes: `git add . && git commit -m "v1.4.0: Description"`
3. Push to GitHub: `git push`
4. Create release tag: `git tag v1.4.0 && git push origin v1.4.0`
5. GitHub Actions automatically builds both installer and portable versions

## ⚠️ WARNING

This application will **PERMANENTLY DESTROY** all data on selected drives. This action cannot be undone. 

### Before Using:
- **Backup important data** to external storage
- **Verify drive selection** - double-check drive letters/numbers
- **Disconnect unnecessary drives** to prevent accidents
- **Run as Administrator** for proper disk access
- **Close other applications** that might access the drives

### Legal Notice:
This tool is designed for legitimate data destruction purposes. Users are responsible for compliance with local laws and regulations regarding data destruction and privacy.

## Requirements

### Runtime
- **Windows 10/11** (Administrator privileges required for wiping)
- **Minimum 4GB RAM** (8GB recommended for large drives)
- **50MB disk space** (plus space for logs and certificates)

### Development
- **Node.js 16+** 
- **Git** for version control
- **Windows SDK** (for native modules)

## Security Features

- **Multiple wipe patterns**: Zeros, ones, random data, verification
- **Compliance standards**: DoD 5220.22-M, NIST 800-88, Gutmann
- **Verification passes**: Confirms data destruction
- **Audit trails**: Detailed logging of all operations
- **Certificate generation**: Legal documentation of wipe completion
- **Clone detection**: Tracks if backup copies were made
- **System protection**: Prevents accidental OS drive wiping