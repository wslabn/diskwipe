; Custom uninstaller script to remove logs
!macro customUnInstall
  ; Remove DiskWipe logs folder from user's home directory
  RMDir /r "$PROFILE\DiskWipe"
!macroend