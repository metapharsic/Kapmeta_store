# PetPooja POS Sales Reconciliation Automation Runner

Write-Host "=========================================================" -ForegroundColor Green
Write-Host "SALES RECONCILIATION AUDIT RUNNER - INITIALIZING" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green

try {
    # Run the type-safe reconciliation engine
    npx ts-node scripts/reconcile.ts
}
catch {
    Write-Host "[ERROR] Sales reconciliation failed: $_" -ForegroundColor Red
    Exit 1
}
