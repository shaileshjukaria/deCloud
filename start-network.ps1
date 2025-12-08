# Start DeCloud with Network Access
# This allows access from phones/tablets on the same WiFi network

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Starting DeCloud with Network Access" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Get local IP address
$ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*" -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
if (-not $ip) {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" } | Select-Object -First 1).IPAddress
}

if (-not $ip) {
    Write-Host "⚠️  Could not detect IP address" -ForegroundColor Yellow
    $ip = "YOUR_IP_HERE"
} else {
    Write-Host "✅ Your Computer IP: $ip" -ForegroundColor Green
}

Write-Host ""

# Check firewall
Write-Host "Checking firewall rules..." -ForegroundColor Yellow
$fwRule = Get-NetFirewallRule -DisplayName "DeCloud*" -ErrorAction SilentlyContinue
if (-not $fwRule) {
    Write-Host "⚠️  Firewall rules not found. You may need to allow Node.js through Windows Firewall" -ForegroundColor Yellow
    Write-Host "   Run this script as Administrator to auto-configure" -ForegroundColor Gray
} else {
    Write-Host "✅ Firewall rules found" -ForegroundColor Green
}

Write-Host ""

# Start Backend
Write-Host "Starting Backend Server (Port 5000)..." -ForegroundColor Green
$backendPath = Join-Path $PSScriptRoot "backend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; npm start"

Start-Sleep -Seconds 3

# Start Frontend with network access
Write-Host "Starting Frontend with Network Access (Port 3000)..." -ForegroundColor Green
$frontendPath = Join-Path $PSScriptRoot "frontend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendPath'; `$env:HOST='0.0.0.0'; npm start"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  DeCloud Started!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📱 Access from this computer:" -ForegroundColor White
Write-Host "   http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "📱 Access from phone (same WiFi):" -ForegroundColor White
Write-Host "   http://$($ip):3000" -ForegroundColor Green
Write-Host ""
Write-Host "🔌 Backend API:" -ForegroundColor White
Write-Host "   http://$($ip):5000/api" -ForegroundColor Cyan
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  Make sure:" -ForegroundColor Yellow
Write-Host "   1. Phone is on same WiFi network" -ForegroundColor Gray
Write-Host "   2. Windows Firewall allows Node.js" -ForegroundColor Gray
Write-Host "   3. Wait 10-15 seconds for servers to start" -ForegroundColor Gray
Write-Host ""
Write-Host "🛑 Close the PowerShell windows to stop servers" -ForegroundColor Gray
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Open browser
Start-Sleep -Seconds 5
Write-Host "Opening browser..." -ForegroundColor Yellow
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "Press any key to exit this window (servers will keep running)..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
