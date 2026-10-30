@echo off
rem Posemark command line: the installer adds this folder to PATH when asked to.
"%~dp0..\Posemark.exe" %*
exit /b %ERRORLEVEL%
