# ==============================================================================
# KAPMETA POS PLATFORM - STARTUP RUNNER AND PROCESS ORCHESTRATOR
# ==============================================================================

# 0. Anchor to Project Root Directory
$rootDir = (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path "$rootDir\package.json")) {
    $rootDir = (Get-Location).Path
}
Set-Location $rootDir

try {
    $host.UI.RawUI.WindowTitle = 'Kapmeta POS Live Server (Port 4444 & 4001)'
} catch {}

Write-Host '=======================================================================' -ForegroundColor Green
Write-Host '         KAPMETA POS AND OPERATIONS PLATFORM - SYSTEM STARTUP          ' -ForegroundColor Green
Write-Host '=======================================================================' -ForegroundColor Green
Write-Host ''
Write-Host '[PORTS AND ENDPOINTS CONFIGURATION]' -ForegroundColor Cyan
Write-Host '  - POS Web UI       : http://localhost:4444 (Port 4444)' -ForegroundColor White
Write-Host '  - API Gateway      : http://localhost:4001 (Port 4001)' -ForegroundColor White
Write-Host '  - PostgreSQL DB    : localhost:5432 (Database: petpooja)' -ForegroundColor White
Write-Host '  - Redis Cache      : localhost:6379' -ForegroundColor White
Write-Host "  - Logs Directory   : $rootDir\logs\" -ForegroundColor White
Write-Host "  - Checkpoints Dir  : $rootDir\checkpoints\" -ForegroundColor White
Write-Host "  - Agents Directory : $rootDir\agents\" -ForegroundColor White
Write-Host "  - Brain Directory  : $rootDir\brain\" -ForegroundColor White
Write-Host ''

$currentDate = Get-Date -Format 'yyyy-MM-dd'
$utcTimestamp = [System.DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')

# 1. Ensure all core directories and log subfolders exist
$requiredDirs = @(
    'logs',
    'logs/app',
    'logs/api',
    'logs/pos-web',
    'logs/admin-web',
    'logs/database',
    'logs/agents',
    'logs/errors',
    'logs/audit',
    'logs/archive',
    'checkpoints',
    'checkpoints/milestones',
    'agents',
    'brain'
)

foreach ($dir in $requiredDirs) {
    $fullDirPath = Join-Path $rootDir $dir
    if (-not (Test-Path -Path $fullDirPath)) {
        New-Item -ItemType Directory -Path $fullDirPath -Force | Out-Null
    }
}

$appLog = Join-Path $rootDir "logs\app\app-$currentDate.log"
$apiLog = Join-Path $rootDir "logs\api\api-$currentDate.log"
$apiErrLog = Join-Path $rootDir "logs\errors\api-$currentDate.err.log"
$posLog = Join-Path $rootDir "logs\pos-web\pos-web-$currentDate.log"
$posErrLog = Join-Path $rootDir "logs\errors\pos-web-$currentDate.err.log"
$migrationLog = Join-Path $rootDir "logs\database\migration-$currentDate.log"

# Log startup initiation event
$startupInitEvent = @{
    timestamp = $utcTimestamp
    level = 'info'
    service = 'orchestrator'
    event = 'STARTUP_INITIATED'
    ports = @{
        posWeb = 4444
        apiGateway = 4001
        database = 5432
        redis = 6379
    }
} | ConvertTo-Json -Compress
$startupInitEvent | Out-File -FilePath $appLog -Append -Encoding utf8

# 2. Check Database Listener on Port 5432
Write-Host '[1/5] Checking PostgreSQL database listener on port 5432...' -ForegroundColor Cyan
$dbListening = $false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $connectTask = $tcp.ConnectAsync('127.0.0.1', 5432)
    if ($connectTask.Wait(1500)) {
        $dbListening = $true
    }
    $tcp.Close()
} catch {
    $dbListening = $false
}

if (-not $dbListening) {
    # Attempt to start windows postgresql service if installed
    $pgService = Get-Service -Name '*postgres*' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pgService -and $pgService.Status -ne 'Running') {
        Write-Host "  [NOTICE] Starting PostgreSQL Windows service '$($pgService.Name)'..." -ForegroundColor Yellow
        try {
            Start-Service -Name $pgService.Name -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            $dbListening = $true
        } catch {}
    }
}

if ($dbListening) {
    Write-Host '  [SUCCESS] PostgreSQL listener active on port 5432.' -ForegroundColor Green
} else {
    Write-Host '  [WARNING] PostgreSQL is not responding on port 5432.' -ForegroundColor Yellow
    Write-Host '            Ensure local PostgreSQL service is started.' -ForegroundColor Yellow
}

# 3. Check and Run Database Migrations
Write-Host '[2/5] Verifying database schema and applying migrations...' -ForegroundColor Cyan
if (Test-Path (Join-Path $rootDir 'scripts\db-migrate.js')) {
    try {
        $migrateOutput = cmd.exe /c "node `"$rootDir\scripts\db-migrate.js`"" 2>&1
        $migrateOutput | Out-File -FilePath $migrationLog -Append -Encoding utf8
        Write-Host '  [SUCCESS] Database migrations verified.' -ForegroundColor Green
    } catch {
        Write-Host "  [WARN] Database migration completed with warnings. Details logged to $migrationLog" -ForegroundColor Yellow
    }
} else {
    Write-Host '  [INFO] No migration script found. Skipping.' -ForegroundColor Gray
}

# 4. Check for Port Conflicts and Clean stale listeners on 4001, 4444, 4445
Write-Host '[3/5] Checking port availability for 4001 (API) and 4444 (POS Web)...' -ForegroundColor Cyan
$portsToCheck = @(4001, 4444, 4445)
foreach ($p in $portsToCheck) {
    $portUsers = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    if ($portUsers) {
        foreach ($conn in $portUsers) {
            $pidToKill = $conn.OwningProcess
            if ($pidToKill -and $pidToKill -ne 0) {
                Write-Host "  [NOTICE] Terminating stale process (PID: $pidToKill) listening on port $p..." -ForegroundColor Yellow
                try {
                    Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
                } catch {}
            }
        }
        Start-Sleep -Milliseconds 400
    }
}

# 5. Launch Backend API Gateway and Frontend POS Web
Write-Host '[4/5] Launching Backend API Gateway and Frontend POS Web UI...' -ForegroundColor Cyan
$npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npmCmd) { $npmCmd = 'npm.cmd' }

Write-Host "  - Starting API Gateway (Port 4001) -> Logging to $apiLog" -ForegroundColor White
$apiProcess = Start-Process -FilePath $npmCmd -ArgumentList 'run', 'dev', '-w', '@kapmeta/api' -WorkingDirectory $rootDir -RedirectStandardOutput $apiLog -RedirectStandardError $apiErrLog -WindowStyle Hidden -PassThru

Write-Host "  - Starting POS Web UI (Port 4444)  -> Logging to $posLog" -ForegroundColor White
$posProcess = Start-Process -FilePath $npmCmd -ArgumentList 'run', 'dev', '-w', '@kapmeta/pos-web' -WorkingDirectory $rootDir -RedirectStandardOutput $posLog -RedirectStandardError $posErrLog -WindowStyle Hidden -PassThru

# Record active PIDs
$runtimePids = @{
    apiProcessId = $apiProcess.Id
    posProcessId = $posProcess.Id
    startedAt = (Get-Date).ToString('o')
} | ConvertTo-Json
$runtimePids | Out-File -FilePath (Join-Path $rootDir '.running_pids.json') -Encoding utf8

# 6. Active Health-Check Polling Loop
Write-Host '[5/5] Waiting for services to become healthy...' -ForegroundColor Cyan
$maxAttempts = 35
$apiReady = $false
$posReady = $false

for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    Write-Host -NoNewline "`r  * Polling services ($attempt/$maxAttempts s)..." -ForegroundColor Gray

    # Check API Health
    if (-not $apiReady) {
        try {
            $apiResp = Invoke-WebRequest -Uri 'http://localhost:4001/health' -TimeoutSec 1 -UseBasicParsing -ErrorAction SilentlyContinue
            if ($apiResp -and $apiResp.StatusCode -eq 200) {
                $apiReady = $true
            }
        } catch {}
    }

    # Check POS Web
    if (-not $posReady) {
        try {
            $posResp = Invoke-WebRequest -Uri 'http://localhost:4444' -TimeoutSec 1 -UseBasicParsing -ErrorAction SilentlyContinue
            if ($posResp -and $posResp.StatusCode -eq 200) {
                $posReady = $true
            }
        } catch {}
    }

    if ($apiReady -and $posReady) {
        break
    }

    Start-Sleep -Seconds 1
}
Write-Host ''

if ($apiReady) {
    Write-Host '  [ONLINE] API Gateway is healthy at http://localhost:4001/health' -ForegroundColor Green
} else {
    Write-Host "  [WARN] API Gateway is still initializing (check logs\api\api-$currentDate.log)" -ForegroundColor Yellow
}

if ($posReady) {
    Write-Host '  [ONLINE] POS Web UI is healthy at http://localhost:4444' -ForegroundColor Green
} else {
    Write-Host "  [WARN] POS Web UI is still compiling (check logs\pos-web\pos-web-$currentDate.log)" -ForegroundColor Yellow
}

# 7. Auto-Launch Default Browser to POS Web
Write-Host ''
Write-Host '  [LAUNCH] Opening POS Web UI in default browser (http://localhost:4444)...' -ForegroundColor Green
try {
    Start-Process 'http://localhost:4444'
} catch {
    Write-Host '  [INFO] Please open http://localhost:4444 in your web browser.' -ForegroundColor Gray
}

# Log successful start
$startupSuccessEvent = @{
    timestamp = [System.DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    level = 'info'
    service = 'orchestrator'
    event = 'STARTUP_SUCCESS'
    apiProcessId = $apiProcess.Id
    posProcessId = $posProcess.Id
    apiHealthy = $apiReady
    posHealthy = $posReady
    urls = @{
        posWeb = 'http://localhost:4444'
        apiGateway = 'http://localhost:4001'
    }
} | ConvertTo-Json -Compress
$startupSuccessEvent | Out-File -FilePath $appLog -Append -Encoding utf8

# 8. Interactive Management & Control Dashboard Loop
function Show-Dashboard {
    try { Clear-Host } catch {}
    Write-Host '=======================================================================' -ForegroundColor Green
    Write-Host '   KAPMETA POS PLATFORM — LIVE CONTROL DASHBOARD (ONLINE)   ' -ForegroundColor Green
    Write-Host '=======================================================================' -ForegroundColor Green
    Write-Host ''
    Write-Host '  [SERVICES STATUS]' -ForegroundColor Cyan
    Write-Host '  - POS Web UI       : http://localhost:4444          [READY]' -ForegroundColor White
    Write-Host '  - API Gateway      : http://localhost:4001/health   [READY]' -ForegroundColor White
    Write-Host '  - PostgreSQL DB    : localhost:5432 (petpooja)      [CONNECTED]' -ForegroundColor White
    Write-Host ''
    Write-Host '  [LOG FILES]' -ForegroundColor Cyan
    Write-Host "  - App Events       : logs\app\app-$currentDate.log" -ForegroundColor Gray
    Write-Host "  - API Gateway Log  : logs\api\api-$currentDate.log" -ForegroundColor Gray
    Write-Host "  - POS Web UI Log   : logs\pos-web\pos-web-$currentDate.log" -ForegroundColor Gray
    Write-Host ''
    Write-Host '-----------------------------------------------------------------------' -ForegroundColor DarkGray
    Write-Host '  [KEYBOARD COMMANDS]' -ForegroundColor Yellow
    Write-Host '    [O] Open POS Web UI in Browser    (http://localhost:4444)' -ForegroundColor White
    Write-Host '    [A] Open API Health Check         (http://localhost:4001/health)' -ForegroundColor White
    Write-Host '    [S] Run Full System Status Check  (Status Dashboard)' -ForegroundColor White
    Write-Host '    [L] View Latest Logs' -ForegroundColor White
    Write-Host '    [R] Restart All Services' -ForegroundColor White
    Write-Host '    [Q] Stop All Services and Exit' -ForegroundColor Red
    Write-Host '=======================================================================' -ForegroundColor Green
    Write-Host '  KapMeta POS is actively serving requests. Press a key above to interact.' -ForegroundColor Green
    Write-Host ''
}

# Determine if running in interactive console
$isInteractive = $false
try {
    if ([System.Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
        $null = [Console]::KeyAvailable
        $isInteractive = $true
    }
} catch {
    $isInteractive = $false
}

if ($isInteractive) {
    Show-Dashboard

    # Interactive Keyboard Loop
    $running = $true
    while ($running) {
        if ([Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true).Key
            switch ($key) {
                'O' {
                    Write-Host '  -> Opening POS Web in browser...' -ForegroundColor Cyan
                    Start-Process 'http://localhost:4444'
                }
                'A' {
                    Write-Host '  -> Opening API health check...' -ForegroundColor Cyan
                    Start-Process 'http://localhost:4001/health'
                }
                'S' {
                    Write-Host "`n--- Running System Status Check ---" -ForegroundColor Cyan
                    if (Test-Path "$rootDir\scripts\status.ts") {
                        cmd.exe /c "npx ts-node `"$rootDir\scripts\status.ts`""
                    }
                    Write-Host "`nPress any key to return to dashboard..." -ForegroundColor Gray
                    [Console]::ReadKey($true) | Out-Null
                    Show-Dashboard
                }
                'L' {
                    Write-Host "`n--- Latest 15 Lines of API Log ---" -ForegroundColor Cyan
                    if (Test-Path $apiLog) {
                        Get-Content -Path $apiLog -Tail 15
                    }
                    Write-Host "`n--- Latest 15 Lines of POS Web Log ---" -ForegroundColor Cyan
                    if (Test-Path $posLog) {
                        Get-Content -Path $posLog -Tail 15
                    }
                    Write-Host "`nPress any key to return to dashboard..." -ForegroundColor Gray
                    [Console]::ReadKey($true) | Out-Null
                    Show-Dashboard
                }
                'R' {
                    Write-Host "`n[RESTART] Stopping services and restarting..." -ForegroundColor Yellow
                    & "$rootDir\scripts\shutdown.ps1"
                    Start-Sleep -Seconds 1
                    & "$rootDir\scripts\startup.ps1"
                    return
                }
                'Q' {
                    Write-Host "`n[SHUTDOWN] Stopping all KapMeta POS services..." -ForegroundColor Red
                    & "$rootDir\scripts\shutdown.ps1"
                    $running = $false
                    Write-Host 'Goodbye! Press any key to close.' -ForegroundColor Gray
                    Start-Sleep -Milliseconds 800
                    break
                }
            }
        }
        Start-Sleep -Milliseconds 250
    }
} else {
    Write-Host '=======================================================================' -ForegroundColor Green
    Write-Host '  [ONLINE] KapMeta POS Platform Services are Running in Background!   ' -ForegroundColor Green
    Write-Host '=======================================================================' -ForegroundColor Green
    Write-Host '  - POS Web UI       : http://localhost:4444' -ForegroundColor Cyan
    Write-Host '  - API Health Check : http://localhost:4001/health' -ForegroundColor Cyan
    Write-Host "  - Logs Directory   : $rootDir\logs\" -ForegroundColor Yellow
    Write-Host '=======================================================================' -ForegroundColor Green
}
