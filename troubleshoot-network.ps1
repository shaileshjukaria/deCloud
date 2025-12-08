# DeCloud Network Access Troubleshooter

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  DeCloud Network Troubleshooter" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check IP Address
Write-Host "1. Checking Network IP..." -ForegroundColor Yellow
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
if ($ip) {
    Write-Host "   ✅ IP Address: $ip" -ForegroundColor Green
} else {
    Write-Host "   ❌ Could not detect IP address" -ForegroundColor Red
}
Write-Host ""

# 2. Check if ports are listening
Write-Host "2. Checking if servers are running..." -ForegroundColor Yellow
$backend = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
$frontend = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue

if ($backend) {
    Write-Host "   ✅ Backend is running on port 5000" -ForegroundColor Green
} else {
    Write-Host "   ❌ Backend is NOT running on port 5000" -ForegroundColor Red
}

if ($frontend) {
    Write-Host "   ✅ Frontend is running on port 3000" -ForegroundColor Green
} else {
    Write-Host "   ❌ Frontend is NOT running on port 3000" -ForegroundColor Red
}
Write-Host ""

# 3. Check firewall rules
Write-Host "3. Checking Firewall..." -ForegroundColor Yellow
$fwRules = Get-NetFirewallRule -DisplayName "*DeCloud*" -ErrorAction SilentlyContinue
if ($fwRules) {
    Write-Host "   ✅ Firewall rules found" -ForegroundColor Green
    $fwRules | ForEach-Object { Write-Host "      - $($_.DisplayName)" -ForegroundColor Gray }
} else {
    Write-Host "   ⚠️  No firewall rules found" -ForegroundColor Yellow
    Write-Host "      Creating firewall rules..." -ForegroundColor Yellow
    
    try {
        New-NetFirewallRule -DisplayName "DeCloud Backend" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -ErrorAction Stop | Out-Null
        New-NetFirewallRule -DisplayName "DeCloud Frontend" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -ErrorAction Stop | Out-Null
        New-NetFirewallRule -DisplayName "DeCloud Peer Discovery" -Direction Inbound -Protocol UDP -LocalPort 5001 -Action Allow -ErrorAction Stop | Out-Null
        Write-Host "   ✅ Firewall rules created" -ForegroundColor Green
    } catch {
        Write-Host "   ❌ Failed to create firewall rules (need Administrator)" -ForegroundColor Red
        Write-Host "      Run as Administrator to auto-create rules" -ForegroundColor Yellow
    }
}
Write-Host ""

# 4. Test localhost connectivity
Write-Host "4. Testing Local Connectivity..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/api" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "   ✅ Backend API responds locally" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Backend API not responding locally" -ForegroundColor Red
    Write-Host "      Error: $($_.Exception.Message)" -ForegroundColor Gray
}
Write-Host ""

# 5. Test network connectivity
if ($ip) {
    Write-Host "5. Testing Network Connectivity..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "http://$($ip):5000/api" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        Write-Host "   ✅ Backend accessible from network ($ip)" -ForegroundColor Green
    } catch {
        Write-Host "   ❌ Backend NOT accessible from network" -ForegroundColor Red
        Write-Host "      Error: $($_.Exception.Message)" -ForegroundColor Gray
    }
    Write-Host ""
}

# 6. Check .env configuration
Write-Host "6. Checking Configuration..." -ForegroundColor Yellow
$envFile = Join-Path $PSScriptRoot "backend\.env"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match "FRONTEND_URL.*192\.168") {
        Write-Host "   ✅ .env includes network IP" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  .env may need network IP added" -ForegroundColor Yellow
    }
    
    if ($envContent -match "ENABLE_PEER_DISCOVERY=true") {
        Write-Host "   ✅ Peer discovery enabled" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Peer discovery disabled" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ❌ .env file not found" -ForegroundColor Red
}
Write-Host ""

# Summary
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Summary" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

if ($ip -and $backend -and $frontend) {
    Write-Host "✅ Everything looks good!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📱 Access from phone:" -ForegroundColor White
    Write-Host "   http://$($ip):3000" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "⚠️  Issues detected:" -ForegroundColor Yellow
    Write-Host ""
    if (-not $ip) {
        Write-Host "   • Network IP not detected" -ForegroundColor Red
    }
    if (-not $backend) {
        Write-Host "   • Backend server not running - Start with: npm start" -ForegroundColor Red
    }
    if (-not $frontend) {
        Write-Host "   • Frontend not running - Start with: HOST=0.0.0.0 npm start" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Make sure phone is on same WiFi" -ForegroundColor Gray
Write-Host "  2. Use start-network.bat or start-network.ps1 to start servers" -ForegroundColor Gray
Write-Host "  3. Access http://$($ip):3000 from phone" -ForegroundColor Gray
Write-Host ""

Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
