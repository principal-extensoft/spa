@echo off
REM Task Time Tracker Launcher (Absolute Paths - Can be placed ANYWHERE)
REM This version uses absolute paths and can be run from desktop, taskbar, etc.
REM Supports both Chrome and Edge

REM ============================================================
REM CONFIGURATION: Set the absolute path to your tracker directory
REM ============================================================
set TRACKER_DIR=c:\github\repos\tracker

REM ============================================================
REM No need to edit below this line
REM ============================================================
set TRACKER_PATH=%TRACKER_DIR%\index.html
set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
set CHROME_PATH_X86="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
set EDGE_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set EDGE_PATH_64="C:\Program Files\Microsoft\Edge\Application\msedge.exe"
set PROFILE_DIR=%TRACKER_DIR%\.chrome-profile

REM Try Chrome 64-bit first
if exist %CHROME_PATH% (
    echo Launching with Chrome...
    start "" %CHROME_PATH% --allow-file-access-from-files --user-data-dir="%PROFILE_DIR%" "file:///%TRACKER_PATH%"
    goto :end
)

REM Try Chrome 32-bit
if exist %CHROME_PATH_X86% (
    echo Launching with Chrome...
    start "" %CHROME_PATH_X86% --allow-file-access-from-files --user-data-dir="%PROFILE_DIR%" "file:///%TRACKER_PATH%"
    goto :end
)

REM Try Edge 32-bit (most common)
if exist %EDGE_PATH% (
    echo Launching with Microsoft Edge...
    start "" %EDGE_PATH% --allow-file-access-from-files --user-data-dir="%PROFILE_DIR%" "file:///%TRACKER_PATH%"
    goto :end
)

REM Try Edge 64-bit
if exist %EDGE_PATH_64% (
    echo Launching with Microsoft Edge...
    start "" %EDGE_PATH_64% --allow-file-access-from-files --user-data-dir="%PROFILE_DIR%" "file:///%TRACKER_PATH%"
    goto :end
)

REM Neither Chrome nor Edge found
echo ERROR: Neither Chrome nor Edge found in default locations.
echo.
echo Checked locations:
echo   - %CHROME_PATH%
echo   - %CHROME_PATH_X86%
echo   - %EDGE_PATH%
echo   - %EDGE_PATH_64%
echo.
echo Please install Chrome or Edge, or update paths in this script.
echo.
echo Press any key to exit...
pause >nul

:end
