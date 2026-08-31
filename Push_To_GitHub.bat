@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title Kapmeta Platform - Push to GitHub Wizard
color 0B

echo =======================================================================
echo         KAPMETA POS PLATFORM - SECURE GITHUB PUSH WIZARD
echo =======================================================================
echo.

:: 1. Ensure logs directory exists
if not exist "logs\git" (
    mkdir "logs\git"
)

:: 2. Check Git Installation
where git >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] Git is not installed or not in system PATH.
    echo Please install Git for Windows to use this script.
    echo.
    pause
    exit /b 1
)

:: 3. Identify Current Branch & Remote
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

:: 4. Inspect Working Directory Changes
echo [STEP 1/4] Inspecting local workspace changes...
echo.
set HAS_UNCOMMITTED=no
for /f "tokens=*" %%i in ('git status --porcelain') do set HAS_UNCOMMITTED=yes

if "%HAS_UNCOMMITTED%"=="yes" (
    color 0E
    echo -----------------------------------------------------------------------
    echo  UNCOMMITTED LOCAL MODIFICATIONS DETECTED:
    echo -----------------------------------------------------------------------
    git status --short
    echo.
    echo -----------------------------------------------------------------------
    echo Enter a commit message for these changes:
    echo (👉 Press [ENTER] to auto-generate a timestamped sync message)
    echo -----------------------------------------------------------------------
    set /p COMMIT_MSG="[Commit Message / Press ENTER]: "
    
    if "!COMMIT_MSG!"=="" (
        for /f "tokens=*" %%I in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"') do set ts=%%I
        set COMMIT_MSG=sync: kapmeta platform updates (!ts!)
    )
    
    echo.
    echo Staging and committing changes with: "!COMMIT_MSG!"...
    git add -A
    git commit -m "!COMMIT_MSG!"
    echo.
    color 0B
) else (
    echo  Workspace is clean. All local modifications are already committed.
    echo.
)

:: 5. Select / Confirm Target Branch
set TARGET_BRANCH=!CURRENT_BRANCH!
echo [STEP 2/4] Target branch: [!TARGET_BRANCH!]
echo.

:: 6. Detailed Outgoing Changes Inspector
echo =======================================================================
echo [STEP 3/4] REVIEWING OUTGOING COMMITS TO BE PUSHED
echo =======================================================================
echo.

echo --- RECENT COMMITS BEING SENT TO GITHUB ---
git log -n 5 --pretty=format:" [%%h] %%ad | %%s (%%an)" --date=short
echo.
echo.

echo --- LATEST COMMIT DETAILS ---
git show --stat --oneline -n 1
echo.
echo =======================================================================
echo.

:: 7. User Confirmation Prompt
echo Do you want to push these commits to GitHub right now?
echo  [Y] Yes, push now (👉 Press ENTER to proceed)
echo  [N] No, cancel push
echo.
set USER_CONFIRM=Y
set /p USER_CONFIRM="Select [Y/N] (Default: Y - Press ENTER to push): "
if /i "%USER_CONFIRM%"=="N" (
    color 0E
    echo.
    echo [CANCELLED] Push aborted by user. No data was transferred.
    echo.
    pause
    exit /b 0
)

:: 8. Execute Verbose Push with Real-Time Progress & Log Capture
echo.
echo =======================================================================
echo [STEP 4/4] PUSHING DATA TO GITHUB WITH COMPLETE LOGS
echo =======================================================================
echo.

for /f "tokens=*" %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set dt=%%I
for /f "tokens=*" %%I in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"') do set HUMAN_TS=%%I
set LOG_FILE=logs\git\push_!dt!.log

echo Execution Timestamp : !HUMAN_TS!
echo Log File Location   : !LOG_FILE!
echo.

:: Run push with verbose progress and capture output
git push -u origin !TARGET_BRANCH! --progress --verbose 2>&1 | powershell -Command "$input | Tee-Object -FilePath '%LOG_FILE%'"

if %ERRORLEVEL% equ 0 (
    color 0A
    echo.
    echo =======================================================================
    echo  SUCCESS: All changes pushed to GitHub successfully!
    echo  Remote Branch: origin/!TARGET_BRANCH!
    echo  Complete Log:  !LOG_FILE!
    echo =======================================================================
    echo.
) else (
    color 0C
    echo.
    echo =======================================================================
    echo  PUSH FAILED: Please check your SSH keys or network connection.
    echo  A detailed diagnostic log was saved to:
    echo  !LOG_FILE!
    echo =======================================================================
    echo.
)

pause
