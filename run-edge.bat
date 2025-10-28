@echo off
REM Task Time Tracker - Edge Launcher
REM MUST be in the same directory as index.html
REM Opens in Microsoft Edge with file access permissions

set TRACKER_PATH=%~dp0index.html
set EDGE_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set EDGE_PATH_64="C:\Program Files\Microsoft\Edge\Application\msedge.exe"
set PROFILE_DIR=%~dp0.edge-profile

REM Try Edge 32-bit (most common)
if exist %EDGE_PATH% (
    echo Launching Task Tracker with Microsoft Edge...
    start "" %EDGE_PATH% --allow-file-access-from-files --user-data-dir="%PROFILE_DIR%" "file:///%TRACKER_PATH%"
    goto :end
)

REM Try Edge 64-bit
if exist %EDGE_PATH_64% (
    echo Launching Task Tracker with Microsoft Edge...
    start "" %EDGE_PATH_64% --allow-file-access-from-files --user-data-dir="%PROFILE_DIR%" "file:///%TRACKER_PATH%"
    goto :end
)

REM Edge not found
echo ERROR: Microsoft Edge not found in default locations.
echo.
echo Checked:
echo   - %EDGE_PATH%
echo   - %EDGE_PATH_64%
echo.
echo Please install Edge or update the EDGE_PATH in this script.
echo.
echo Press any key to exit...
pause >nul

:end
