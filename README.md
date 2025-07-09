# DiskWipe - Secure Drive Wiping Utility

A secure Electron-based application for permanently wiping disk drives using multiple-pass overwriting.

## Features

- **Multi-pass wiping**: 3-pass secure deletion using diskpart clean all
- **Drive detection**: Automatically detects available physical drives
- **Progress tracking**: Real-time progress updates during wiping
- **Safety warnings**: Multiple confirmations before destructive operations
- **System disk protection**: Prevents wiping of boot drive
- **Auto-updates**: Automatically updates from GitHub releases
- **Dark/Light mode**: Follows system theme or manual toggle

## Installation

Download the latest release from [Releases](https://github.com/YOUR_USERNAME/diskwipe/releases)

## Development

```bash
npm install
npm start
```

## Building

```bash
npm run build
```

## Deployment Steps

1. Replace `YOUR_GITHUB_USERNAME` in package.json with your GitHub username
2. Create GitHub repository named `diskwipe`
3. Push code to GitHub
4. Create a release tag: `git tag v1.0.0 && git push origin v1.0.0`
5. GitHub Actions will automatically build and create release

## ⚠️ WARNING

This application will **PERMANENTLY DESTROY** all data on selected drives. This action cannot be undone. Always ensure you have backed up important data before using this tool.

## Requirements

- Windows (Administrator privileges required)
- Node.js 16+ (for development)