; RelWave NSIS Installer Hooks
; Kill bridge.exe before install/update to prevent "Error opening file for writing" errors

!macro NSIS_HOOK_PREINSTALL
  ; Kill any running bridge process (ignore errors if not running)
  nsExec::ExecToLog 'taskkill /F /IM "bridge-x86_64-pc-windows-msvc.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "RelWave.exe" /T'
  Sleep 1000
!macroend