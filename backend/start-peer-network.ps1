# Start multiple backend instances to test peer discovery
# Run this script in PowerShell to start 3 peer instances

Write-Host "🚀 Starting DeCloud Peer Network..." -ForegroundColor Cyan
Write-Host ""

# Check if MongoDB is running
$mongoProcess = Get-Process mongod -ErrorAction SilentlyContinue
if (-not $mongoProcess) {
    Write-Host "⚠️  Warning: MongoDB might not be running!" -ForegroundColor Yellow
    Write-Host "   Start MongoDB before running peers" -ForegroundColor Yellow
    Write-Host ""
}

# Function to start a peer instance in a new terminal
function Start-PeerInstance {
    param(
        [int]$Port,
        [int]$PeerPort,
        [string]$Name
    )
    
    Write-Host "Starting $Name on HTTP:$Port, UDP:$PeerPort..." -ForegroundColor Green
    
    $command = "cd '$PSScriptRoot'; `$env:PORT='$Port'; `$env:PEER_PORT='$PeerPort'; `$env:MONGODB_URI='mongodb://localhost:27017/decloud'; node server.js"
    
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $command
}

# Start three peer instances
Start-PeerInstance -Port 5000 -PeerPort 5001 -Name "Peer 1"
Start-Sleep -Seconds 2

Start-PeerInstance -Port 5100 -PeerPort 5101 -Name "Peer 2"
Start-Sleep -Seconds 2

Start-PeerInstance -Port 5200 -PeerPort 5201 -Name "Peer 3"

Write-Host ""
Write-Host "✅ Started 3 peer instances!" -ForegroundColor Green
Write-Host ""
Write-Host "Peer 1: http://localhost:5000 (UDP: 5001)" -ForegroundColor Cyan
Write-Host "Peer 2: http://localhost:5100 (UDP: 5101)" -ForegroundColor Cyan
Write-Host "Peer 3: http://localhost:5200 (UDP: 5201)" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 Each instance will discover the others within 5-10 seconds" -ForegroundColor Yellow
Write-Host "💡 Connect frontend to any instance to see all peers" -ForegroundColor Yellow
Write-Host "💡 Upload files through any instance to test distribution" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C in each terminal window to stop instances" -ForegroundColor Gray
