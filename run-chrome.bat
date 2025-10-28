@echo off
REM Task Time Tracker - Chrome Launcher
REM MUST be in the same directory as index.html
REM Opens in Google Chrome with file access permissions

set TRACKER_PATH=%~dp0index.html
set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
set CHROME_PATH_X86="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
set PROFILE_DIR=%~dp0.chrome-profile

REM Try Chrome 64-bit first
if exist %CHROME_PATH% (
    echo Launching Task Tracker with Chrome...
    start "" %CHROME_PATH% --allow-file-access-from-files --user-data-dir="%PROFILE_DIR%" "file:///%TRACKER_PATH%"
    goto :end
)

REM Try Chrome 32-bit
if exist %CHROME_PATH_X86% (
    echo Launching Task Tracker with Chrome...
    start "" %CHROME_PATH_X86% --allow-file-access-from-files --user-data-dir="%PROFILE_DIR%" "file:///%TRACKER_PATH%"
    goto :end
)

REM Chrome not found
echo ERROR: Google Chrome not found in default locations.
echo.
echo Checked:
echo   - %CHROME_PATH%
echo   - %CHROME_PATH_X86%
echo.
echo Please install Chrome or update the CHROME_PATH in this script.
echo.
echo Press any key to exit...
pause >nul

:end
