@echo off
echo.
echo ============================================
echo   Starting DeCloud with Network Access
echo ============================================
echo.

cd /d "%~dp0"

REM Get local IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set IP=%%a
    goto :ip_found
)
:ip_found
set IP=%IP:~1%

echo Your Computer IP: %IP%
echo.

echo Starting Backend on Port 5000...
start "DeCloud Backend" cmd /k "cd /d "%~dp0backend" && npm start"

timeout /t 3 /nobreak >nul

echo Starting Frontend with Network Access...
start "DeCloud Frontend" cmd /k "cd /d "%~dp0frontend" && set HOST=0.0.0.0 && npm start"

echo.
echo ============================================
echo   DeCloud Started with Network Access!
echo ============================================
echo.
echo   From this computer:
echo   http://localhost:3000
echo.
echo   From your phone (same WiFi):
echo   http://%IP%:3000
echo.
echo   Backend API:
echo   http://%IP%:5000/api
echo.
echo ============================================
echo.
echo   Make sure:
echo   1. Phone is on same WiFi network
echo   2. Windows Firewall allows Node.js
echo   3. Wait 10-15 seconds for servers to start
echo.
echo   Close the terminal windows to stop servers
echo ============================================
echo.
pause
