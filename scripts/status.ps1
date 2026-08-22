# ==============================================================================
# KAPMETA / PETPOOJA POS PLATFORM — LIVE STATUS DASHBOARD
# ==============================================================================

$rootDir = (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path "$rootDir\package.json")) {
    $rootDir = (Get-Location).Path
}
Set-Location $rootDir

npx ts-node "$rootDir\scripts\status.ts"
