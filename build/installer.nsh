; Posemark NSIS additions (electron-builder `nsis.include`).
;
; Explorer context menu entries, written to the same registry hive as the rest of the install
; (SHCTX: HKLM for "all users", HKCU for "current user"):
;   files              "Open with Posemark"          Software\Classes\*\shell\Posemark
;   folders            "Open Folder with Posemark"   Software\Classes\Directory\shell\Posemark
;   folder background  "Open Folder with Posemark"   Software\Classes\Directory\Background\shell\Posemark
; The labels follow the installer language. The uninstaller removes the keys again.
; Plus, on request, the bin folder on PATH for the `posemark` command (see below).

; the uninstaller is compiled from the same include without customInstall, so keep the
; variables out of that build (an unused Var is a warning, and warnings fail the build)
!ifndef BUILD_UNINSTALLER
  Var posemarkCtxFile
  Var posemarkCtxFolder
  Var posemarkAddPath
  Var posemarkAddPathBox
  !include "nsDialogs.nsh"
  !include "WinMessages.nsh"
  !include "StrFunc.nsh"
  ${StrStr}
!else
  !include "WinMessages.nsh"
  !include "StrFunc.nsh"
  ${UnStrRep}
!endif

; ---------------------------------------------------------------- command line (bin\posemark.cmd)
; One extra page after the folder choice: a checkbox that puts $INSTDIRin on PATH, so
; `posemark file.md` and `posemark export …` work from any terminal. User PATH for a per-user
; install, the machine PATH for all users. What was added is remembered under Software\Posemark
; so the uninstaller can take exactly that back out again.
!ifndef BUILD_UNINSTALLER
; the page functions live inside the macro: it is expanded with the other pages, after MUI2
; is loaded, while this file itself is included before that
!macro customPageAfterChangeDir
  Page custom posemarkCliPage posemarkCliPageLeave

Function posemarkCliPage
  ${If} $LANGUAGE == 2052
    !insertmacro MUI_HEADER_TEXT "命令行" "在终端里使用 posemark 命令"
    StrCpy $0 "把 posemark 命令加入 PATH（安装目录下的 bin 文件夹）"
    StrCpy $1 "之后在任意终端里可以运行 posemark 文件.md 打开文件，或 posemark export 文件.md -f pdf 导出。已打开的终端需要重新打开才能看到新的 PATH。"
  ${Else}
    !insertmacro MUI_HEADER_TEXT "Command line" "Use the posemark command in a terminal"
    StrCpy $0 "Add the posemark command to PATH (the bin folder of the install)"
    StrCpy $1 "Afterwards any terminal can run posemark file.md to open a file, or posemark export file.md -f pdf. Terminals that are already open need to be reopened to see the new PATH."
  ${EndIf}
  nsDialogs::Create 1018
  Pop $2
  ${If} $2 == error
    Abort
  ${EndIf}
  ${NSD_CreateCheckbox} 0 10u 100% 12u $0
  Pop $posemarkAddPathBox
  ${NSD_Check} $posemarkAddPathBox
  ${NSD_CreateLabel} 12u 30u 100% 40u $1
  Pop $2
  nsDialogs::Show
FunctionEnd

Function posemarkCliPageLeave
  ${NSD_GetState} $posemarkAddPathBox $posemarkAddPath
FunctionEnd

Function posemarkAddToPath
  ${If} $installMode == "all"
    ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path"
  ${Else}
    ReadRegStr $0 HKCU "Environment" "Path"
  ${EndIf}
  ; NSIS strings are bounded; a PATH already near the limit must not be cut short
  StrLen $1 $0
  IntOp $2 ${NSIS_MAX_STRLEN} - 300
  ${If} $1 > $2
    DetailPrint "PATH is too long to extend safely; posemark was not added"
    Return
  ${EndIf}
  ${StrStr} $1 $0 "$INSTDIRin"
  ${If} $1 == ""
    ${If} $0 == ""
      StrCpy $0 "$INSTDIRin"
    ${Else}
      StrCpy $0 "$0;$INSTDIRin"
    ${EndIf}
    ${If} $installMode == "all"
      WriteRegExpandStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path" $0
    ${Else}
      WriteRegExpandStr HKCU "Environment" "Path" $0
    ${EndIf}
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
  ${EndIf}
  WriteRegStr SHCTX "Software\Posemark" "PathEntry" "$INSTDIRin"
FunctionEnd
!macroend

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

  ${If} $posemarkAddPath == ${BST_CHECKED}
    Call posemarkAddToPath
  ${EndIf}
!macroend

!macro customUnInstall
  DeleteRegKey SHCTX "Software\Classes\*\shell\Posemark"
  DeleteRegKey SHCTX "Software\Classes\Directory\shell\Posemark"
  DeleteRegKey SHCTX "Software\Classes\Directory\Background\shell\Posemark"

  ; take the bin folder back out of PATH if this install put it there
  ReadRegStr $R0 SHCTX "Software\Posemark" "PathEntry"
  ${If} $R0 != ""
    ${If} $installMode == "all"
      ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path"
    ${Else}
      ReadRegStr $0 HKCU "Environment" "Path"
    ${EndIf}
    StrLen $1 $0
    IntOp $2 ${NSIS_MAX_STRLEN} - 300
    ${If} $1 < $2
      ${UnStrRep} $0 $0 ";$R0;" ";"
      ${UnStrRep} $0 $0 ";$R0" ""
      ${UnStrRep} $0 $0 "$R0;" ""
      ${If} $0 == $R0
        StrCpy $0 ""
      ${EndIf}
      ${If} $installMode == "all"
        WriteRegExpandStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path" $0
      ${Else}
        WriteRegExpandStr HKCU "Environment" "Path" $0
      ${EndIf}
      SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
    ${EndIf}
    DeleteRegKey SHCTX "Software\Posemark"
  ${EndIf}
!macroend
