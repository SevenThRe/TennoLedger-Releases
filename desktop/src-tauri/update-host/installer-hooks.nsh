; Only our reserved updater cache is removed; account data remains in AppData.
!macro NSIS_HOOK_PREINSTALL
  Delete "$INSTDIR\.tennoledger-update\pending"
!macroend
!macro NSIS_HOOK_POSTUNINSTALL
  RMDir /r "$INSTDIR\.tennoledger-update"
!macroend
