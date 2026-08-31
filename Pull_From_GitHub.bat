@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title Kapmeta POS - Pull from GitHub
color 0B

echo =======================================================================
echo              KAPMETA POS PLATFORM - GITHUB PULL WIZARD
echo =======================================================================
echo.

:: 1. Verify Git Installation
where git >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Git is not installed or not found in system PATH.
    echo Please install Git from https://git-scm.com/ and try again.
    echo.
    pause
    exit /b 1
)

:: 2. Display Remote and Current Branch Info
echo [GIT REPOSITORY INFO]
git remote -v
echo.
for /f "tokens=*" %%i in ('git branch --show-current') do set CURRENT_BRANCH=%%i
if "%CURRENT_BRANCH%"=="" set CURRENT_BRANCH=main
echo Current active local branch: [%CURRENT_BRANCH!]
echo.

:: 3. Select Target Branch to Pull
echo Target branch to pull from remote:
echo Press ENTER to pull from [!CURRENT_BRANCH!] or type another branch name:
set /p TARGET_BRANCH="> "
if "!TARGET_BRANCH!"=="" set TARGET_BRANCH=!CURRENT_BRANCH!

echo.
echo =======================================================================
echo  Target Remote : origin (https://github.com/metapharsic/Kapmeta_store.git)
echo  Source Branch : !TARGET_BRANCH!
echo =======================================================================
echo.
echo Fetching and pulling latest changes from GitHub...
echo.

git pull origin !TARGET_BRANCH! --progress

if %errorlevel% equ 0 (
    color 0A
    echo.
    echo =======================================================================
    echo [SUCCESS] Successfully pulled latest data from GitHub:
    echo           https://github.com/metapharsic/Kapmeta_store.git (Branch: !TARGET_BRANCH!)
    echo =======================================================================
) else (
    color 0C
    echo.
    echo =======================================================================
    echo [FAILED] Pull failed with error code %errorlevel%.
    echo Check for local conflicts or uncommitted changes.
    echo =======================================================================
)

echo.
pause
