# ==============================================================================
# KAPMETA / PETPOOJA POS PLATFORM - SHUTDOWN RUNNER AND PROCESS TERMINATOR
# ==============================================================================

# 0. Anchor to Project Root Directory
$rootDir = (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path "$rootDir\package.json")) {
    $rootDir = (Get-Location).Path
}
Set-Location $rootDir

Write-Host "=======================================================================" -ForegroundColor Red
Write-Host "         KAPMETA POS AND OPERATIONS PLATFORM - SYSTEM SHUTDOWN         " -ForegroundColor Red
Write-Host "=======================================================================" -ForegroundColor Red
Write-Host ""

$currentDate = Get-Date -Format "yyyy-MM-dd"
$utcTimestamp = [System.DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
$appLog = Join-Path $rootDir "logs\app\app-$currentDate.log"

$portsToRelease = @(4001, 4444, 4445)
$terminatedProcesses = @()

# 1. Terminate recorded PIDs from .running_pids.json
$pidsFile = Join-Path $rootDir ".running_pids.json"
if (Test-Path $pidsFile) {
    try {
        $pidsData = Get-Content -Path $pidsFile -Raw | ConvertFrom-Json
        $trackedPids = @($pidsData.apiProcessId, $pidsData.posProcessId)
        foreach ($pidToStop in $trackedPids) {
            if ($pidToStop -and $pidToStop -ne 0) {
                try {
                    $proc = Get-Process -Id $pidToStop -ErrorAction SilentlyContinue
                    if ($proc) {
                        Write-Host "  - Stopping tracked launcher process '$($proc.ProcessName)' (PID: $pidToStop)..." -ForegroundColor Yellow
                        Stop-Process -Id $pidToStop -Force -ErrorAction SilentlyContinue
                        $terminatedProcesses += @{ pid = $pidToStop; name = $proc.ProcessName; source = "runtime_pids" }
                    }
                } catch {}
            }
        }
        Remove-Item -Path $pidsFile -Force -ErrorAction SilentlyContinue
    } catch {}
}

# 2. Inspect and terminate all listening processes on ports 4001, 4444, 4445
foreach ($port in $portsToRelease) {
    Write-Host "[SHUTDOWN] Inspecting port $port..." -ForegroundColor Yellow
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    
    if ($connections) {
        foreach ($conn in $connections) {
            $pidToKill = $conn.OwningProcess
            if ($pidToKill -and $pidToKill -ne 0) {
                try {
                    $process = Get-Process -Id $pidToKill -ErrorAction SilentlyContinue
                    if ($process) {
                        Write-Host "  - Terminating process '$($process.ProcessName)' (PID: $pidToKill) on port $port..." -ForegroundColor Yellow
                        Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
                        $terminatedProcesses += @{ port = $port; pid = $pidToKill; name = $process.ProcessName; source = "port_listener" }
                    }
                } catch {
                    Write-Host "  - Could not stop PID $($pidToKill): $_" -ForegroundColor Red
                }
            }
        }
    } else {
        Write-Host "  [OK] Port $port is free." -ForegroundColor Green
    }
}

# Verify release
Start-Sleep -Milliseconds 600
$allClean = $true
foreach ($port in $portsToRelease) {
    $remaining = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($remaining) {
        $activePid = ($remaining | Select-Object -First 1).OwningProcess
        if ($activePid -ne 0) {
            Write-Host "  [WARN] Port $port still occupied by PID $activePid" -ForegroundColor Red
            $allClean = $false
        }
    }
}

# Log shutdown event
if (Test-Path (Join-Path $rootDir "logs\app")) {
    $shutdownEvent = @{
        timestamp = $utcTimestamp
        level = "info"
        service = "orchestrator"
        event = "SHUTDOWN_COMPLETED"
        terminatedProcesses = $terminatedProcesses
        allPortsClean = $allClean
    } | ConvertTo-Json -Compress
    $shutdownEvent | Out-File -FilePath $appLog -Append -Encoding utf8
}

Write-Host ""
if ($allClean) {
    Write-Host "=======================================================================" -ForegroundColor Green
    Write-Host "  [SUCCESS] All PetPooja POS Platform Services Successfully Stopped!   " -ForegroundColor Green
    Write-Host "=======================================================================" -ForegroundColor Green
} else {
    Write-Host "=======================================================================" -ForegroundColor Yellow
    Write-Host "  [NOTICE] Shutdown executed. Some processes may require manual cleanup" -ForegroundColor Yellow
    Write-Host "=======================================================================" -ForegroundColor Yellow
}
Write-Host ""
