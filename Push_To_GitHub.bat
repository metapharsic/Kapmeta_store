@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title Kapmeta POS - Push to GitHub
color 0B

echo =======================================================================
echo               KAPMETA POS PLATFORM - GITHUB PUSH WIZARD
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
echo Current active local branch: [%CURRENT_BRANCH%]
echo.

:: 3. Stage and Commit if changes exist
echo [1/3] Checking working directory status...
git status --short
echo.

set HAS_CHANGES=no
for /f "tokens=*" %%i in ('git status --porcelain') do set HAS_CHANGES=yes

if "%HAS_CHANGES%"=="yes" (
    echo [2/3] Uncommitted changes detected.
    echo Enter a commit message (or press ENTER for auto-generated message):
    set /p COMMIT_MSG="> "
    
    if "!COMMIT_MSG!"=="" (
        for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
        set COMMIT_MSG=update: kapmeta pos platform synchronization (!datetime:~0,4!-!datetime:~4,2!-!datetime:~6,2! !datetime:~8,2!:!datetime:~10,2!)
    )
    
    echo Staging all changes...
    git add -A
    
    echo Committing: "!COMMIT_MSG!"
    git commit -m "!COMMIT_MSG!"
) else (
    echo [2/3] Working tree is clean. Ready to push existing commits.
)
echo.

:: 4. Select Target Branch
echo [3/3] Target branch to push:
echo Press ENTER to push to [!CURRENT_BRANCH!] or type another branch name:
set /p TARGET_BRANCH="> "
if "!TARGET_BRANCH!"=="" set TARGET_BRANCH=!CURRENT_BRANCH!

echo.
echo =======================================================================
echo  Target Remote : origin (git@github.com:metapharsic/Kapmeta_store.git)
echo  Target Branch : !TARGET_BRANCH!
echo =======================================================================
echo.
echo Pushing commits to GitHub... Please wait...
echo.

git push -u origin !TARGET_BRANCH! --progress

if %errorlevel% equ 0 (
    color 0A
    echo.
    echo =======================================================================
    echo [SUCCESS] Successfully pushed all data to GitHub:
    echo           git@github.com:metapharsic/Kapmeta_store.git (Branch: !TARGET_BRANCH!)
    echo =======================================================================
) else (
    color 0C
    echo.
    echo =======================================================================
    echo [FAILED] Push failed (error code %errorlevel%).
    echo.
    echo If you see "Permission denied (publickey)":
    echo 1. Copy your SSH public key from: C:\Users\Dell\.ssh\id_ed25519.pub
    echo 2. Go to: https://github.com/settings/ssh/new
    echo 3. Paste the key and save it.
    echo =======================================================================
)

echo.
pause
