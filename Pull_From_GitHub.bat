@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title Kapmeta POS - Pull from GitHub (Detailed Inspector & Logger)
color 0B

echo =======================================================================
echo              KAPMETA POS PLATFORM - GITHUB PULL WIZARD
echo =======================================================================
echo.

:: 1. Ensure log directory exists
if not exist "logs\git" (
    mkdir "logs\git"
)

:: 2. Verify Git Installation
where git >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Git is not installed or not found in system PATH.
    echo Please install Git from https://git-scm.com/ and try again.
    echo.
    pause
    exit /b 1
)

:: 3. Display Remote & Branch Configuration
for /f "tokens=*" %%i in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set CURRENT_BRANCH=%%i
if "%CURRENT_BRANCH%"=="" set CURRENT_BRANCH=main

for /f "tokens=2" %%i in ('git remote get-url origin 2^>nul') do set REMOTE_URL=%%i
if "%REMOTE_URL%"=="" (
    for /f "tokens=*" %%i in ('git remote get-url origin 2^>nul') do set REMOTE_URL=%%i
)

echo [REPOSITORY CONTEXT]
echo  - Active Branch : [%CURRENT_BRANCH%]
echo  - Target Remote : origin (%REMOTE_URL%)
echo =======================================================================
echo.

:: 4. Select Target Branch to Pull
set TARGET_BRANCH=!CURRENT_BRANCH!
echo [STEP 1/2] Branch to pull: [!TARGET_BRANCH!]
echo.

:: 5. Execute Verbose Pull & Capture Logs
echo =======================================================================
echo [STEP 2/2] FETCHING AND PULLING LATEST COMMITS FROM GITHUB
echo =======================================================================
echo.

for /f "tokens=*" %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set dt=%%I
for /f "tokens=*" %%I in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"') do set HUMAN_TS=%%I
set LOG_FILE=logs\git\pull_!dt!.log

echo Execution Timestamp : !HUMAN_TS!
echo Log File Location   : !LOG_FILE!
echo.

git pull origin !TARGET_BRANCH! --progress --verbose 2>&1 | powershell -Command "$input | Tee-Object -FilePath '%LOG_FILE%'"

if %errorlevel% equ 0 (
    color 0A
    echo.
    echo =======================================================================
    echo [SUCCESS] LATEST UPDATES SUCCESSFULLY PULLED FROM GITHUB!
    echo  - Branch    : !TARGET_BRANCH!
    echo  - Log saved : !LOG_FILE!
    echo =======================================================================
    echo.
    echo --- RECENT 3 COMMITS ON LOCAL WORKSPACE ---
    git log -n 3 --pretty=format:" [%%h] %%ad | %%s (%%an)" --date=short
    echo.
) else (
    color 0C
    echo.
    echo =======================================================================
    echo [FAILED] Pull encountered an error (Exit Code: %errorlevel%).
    echo Detailed logs written to: !LOG_FILE!
    echo.
    echo Check for local conflicting changes or uncommitted modifications.
    echo =======================================================================
)

echo.
pause
