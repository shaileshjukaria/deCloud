@echo off
echo.
echo ============================================
echo   Starting DeCloud Peer Network Test
echo ============================================
echo.

cd /d "%~dp0"

echo Starting Peer 1 (Port 5000, UDP 5001)...
start "DeCloud Peer 1" cmd /k "set PORT=5000 && set PEER_PORT=5001 && node server.js"

timeout /t 2 /nobreak >nul

echo Starting Peer 2 (Port 5100, UDP 5101)...
start "DeCloud Peer 2" cmd /k "set PORT=5100 && set PEER_PORT=5101 && node server.js"

timeout /t 2 /nobreak >nul

echo Starting Peer 3 (Port 5200, UDP 5201)...
start "DeCloud Peer 3" cmd /k "set PORT=5200 && set PEER_PORT=5201 && node server.js"

echo.
echo ============================================
echo   3 Peer Instances Started!
echo ============================================
echo.
echo   Peer 1: http://localhost:5000
echo   Peer 2: http://localhost:5100
echo   Peer 3: http://localhost:5200
echo.
echo   Wait 5-10 seconds for peer discovery
echo   Then check the Peers page in frontend
echo.
echo   Close each window to stop instances
echo ============================================
echo.
pause
