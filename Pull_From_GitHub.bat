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

:: 4. Select Target Branch to Pull
echo [STEP 1/2] Select branch to pull:
echo Press ENTER to pull from [!CURRENT_BRANCH!] or type another branch name:
set /p TARGET_BRANCH="> "
if "!TARGET_BRANCH!"=="" set TARGET_BRANCH=!CURRENT_BRANCH!
echo.

:: 5. Execute Verbose Pull & Capture Logs
echo =======================================================================
echo [STEP 2/2] FETCHING AND PULLING LATEST COMMITS FROM GITHUB
echo =======================================================================
echo.

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set dt=%%I
set LOG_FILE=logs\git\pull_!dt:~0,8!_!dt:~8,6!.log

echo Execution Timestamp : !dt:~0,4!-!dt:~4,2!-!dt:~6,2! !dt:~8,2!:!dt:~10,2!:!dt:~12,2!
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
