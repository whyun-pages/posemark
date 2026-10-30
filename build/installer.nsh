; Posemark NSIS additions (electron-builder `nsis.include`).
;
; Explorer context menu entries, written to the same registry hive as the rest of the install
; (SHCTX: HKLM for "all users", HKCU for "current user"):
;   files              "Open with Posemark"          Software\Classes\*\shell\Posemark
;   folders            "Open Folder with Posemark"   Software\Classes\Directory\shell\Posemark
;   folder background  "Open Folder with Posemark"   Software\Classes\Directory\Background\shell\Posemark
; The labels follow the installer language. The uninstaller removes the keys again.

; the uninstaller is compiled from the same include without customInstall, so keep the
; variables out of that build (an unused Var is a warning, and warnings fail the build)
!ifndef BUILD_UNINSTALLER
  Var posemarkCtxFile
  Var posemarkCtxFolder
!endif

!macro customInstall
  ${If} $LANGUAGE == 2052
    StrCpy $posemarkCtxFile "用 Posemark 打开"
    StrCpy $posemarkCtxFolder "用 Posemark 打开文件夹"
  ${Else}
    StrCpy $posemarkCtxFile "Open with Posemark"
    StrCpy $posemarkCtxFolder "Open Folder with Posemark"
  ${EndIf}

  WriteRegStr SHCTX "Software\Classes\*\shell\Posemark" "" $posemarkCtxFile
  WriteRegStr SHCTX "Software\Classes\*\shell\Posemark" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr SHCTX "Software\Classes\*\shell\Posemark\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  WriteRegStr SHCTX "Software\Classes\Directory\shell\Posemark" "" $posemarkCtxFolder
  WriteRegStr SHCTX "Software\Classes\Directory\shell\Posemark" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr SHCTX "Software\Classes\Directory\shell\Posemark\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\Posemark" "" $posemarkCtxFolder
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\Posemark" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\Posemark\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'
!macroend

!macro customUnInstall
  DeleteRegKey SHCTX "Software\Classes\*\shell\Posemark"
  DeleteRegKey SHCTX "Software\Classes\Directory\shell\Posemark"
  DeleteRegKey SHCTX "Software\Classes\Directory\Background\shell\Posemark"
!macroend
