# start-backend.ps1 — kills any existing instance then auto-restarts the fledz API server on crash
$PORT = 3001
$serverScript = "c:\projects\fledz-travel\backend\server.js"

while ($true) {
    # Kill any process already holding the port
    $existing = Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "⚡ Killing existing process on port $PORT (PID $($existing.OwningProcess))..." -ForegroundColor Magenta
        Stop-Process -Id $existing.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    }

    Write-Host "▶ Starting fledz-api..." -ForegroundColor Cyan
    node $serverScript
    $code = $LASTEXITCODE
    Write-Host "⚠ Server exited (code $code). Restarting in 2s..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
}
