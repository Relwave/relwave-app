; RelWave NSIS Installer Hooks
; Kill bridge.exe before install/update to prevent "Error opening file for writing" errors

!macro NSIS_HOOK_PREINSTALL
  ; Kill any running bridge.exe process before installing
  nsExec::ExecToLog 'taskkill /F /IM "bridge.exe"'
  ; Also kill the main app if it's still running
  nsExec::ExecToLog 'taskkill /F /IM "RelWave.exe"'
  ; Small delay to ensure file handles are released
  Sleep 1000
!macroend
