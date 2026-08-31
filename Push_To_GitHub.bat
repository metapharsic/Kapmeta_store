@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title Kapmeta POS - Push to GitHub (Detailed Inspector & Logger)
color 0B

echo =======================================================================
echo               KAPMETA POS PLATFORM - GITHUB PUSH WIZARD
echo =======================================================================
echo.

:: 1. Ensure log directory exists
if not exist logs\git mkdir logs\git

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
for /f "tokens=*" %%i in ('git branch --show-current') do set CURRENT_BRANCH=%%i
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
    echo (Or press ENTER to auto-generate a timestamped sync message)
    set /p COMMIT_MSG="> "
    
    if "!COMMIT_MSG!"=="" (
        for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
        set COMMIT_MSG=sync: kapmeta platform updates (!datetime:~0,4!-!datetime:~4,2!-!datetime:~6,2! !datetime:~8,2!:!datetime:~10,2!)
    )
    
    echo.
    echo Staging and committing changes...
    git add -A
    git commit -m "!COMMIT_MSG!"
    echo.
    color 0B
) else (
    echo  Workspace is clean. No uncommitted local files.
    echo.
)

:: 5. Select / Confirm Target Branch
echo [STEP 2/4] Target branch to push:
echo Press ENTER to push to [!CURRENT_BRANCH!] or type another branch name:
set /p TARGET_BRANCH="> "
if "!TARGET_BRANCH!"=="" set TARGET_BRANCH=!CURRENT_BRANCH!
echo.

:: 6. Detailed Outgoing Changes Inspector
echo =======================================================================
echo [STEP 3/4] REVIEWING OUTGOING COMMITS & CHANGES TO BE PUSHED
echo =======================================================================
echo.

:: Check recent local commits that are ready to push
echo --- COMMITS BEING SENT TO GITHUB ---
git log -n 5 --pretty=format:" [%%h] %%ad | %%s (%%an)" --date=short
echo.
echo.

echo --- DETAILED FILE CHANGE STATS (Last Commit) ---
git show --stat --oneline -n 1
echo.
echo =======================================================================
echo.

:: 7. User Confirmation Prompt
echo Do you want to proceed with pushing the above changes to GitHub?
echo  [Y] Yes, push now (Default)
echo  [N] No, cancel push
set /p USER_CONFIRM="Select [Y/N] (Default: Y): "
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

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set dt=%%I
set LOG_FILE=logs\git\push_!dt:~0,8!_!dt:~8,6!.log

echo Execution Timestamp : !dt:~0,4!-!dt:~4,2!-!dt:~6,2! !dt:~8,2!:!dt:~10,2!:!dt:~12,2!
echo Log File Location   : !LOG_FILE!
echo.

:: Run push with verbose progress and capture output
git push -u origin !TARGET_BRANCH! --progress --verbose 2>&1 | powershell -Command "$input | Tee-Object -FilePath '%LOG_FILE%'"

if %errorlevel% equ 0 (
    color 0A
    echo.
    echo =======================================================================
    echo [SUCCESS] ALL COMMITS & ASSETS SUCCESSFULLY PUSHED TO GITHUB!
    echo  - Repository : %REMOTE_URL%
    echo  - Branch     : !TARGET_BRANCH!
    echo  - Log saved  : !LOG_FILE!
    echo =======================================================================
) else (
    color 0C
    echo.
    echo =======================================================================
    echo [FAILED] Push encountered an error (Exit Code: %errorlevel%).
    echo Detailed logs written to: !LOG_FILE!
    echo.
    echo --- COMMON SOLUTIONS ---
    echo  1. If "Permission denied (publickey)":
    echo     Add your SSH key to GitHub: https://github.com/settings/ssh/new
    echo     Your public key is in: C:\Users\Dell\.ssh\id_ed25519.pub
    echo.
    echo  2. If the remote has newer commits:
    echo     Run Pull_From_GitHub.bat first to merge updates.
    echo =======================================================================
)

echo.
pause
