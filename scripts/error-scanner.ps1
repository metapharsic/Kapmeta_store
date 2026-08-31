# ==============================================================================
# KAPMETA POS PLATFORM — LOG ERROR SCANNER
# ==============================================================================

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "npx ts-node .\scripts\read-errors.ts"
