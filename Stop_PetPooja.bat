@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title Kapmeta POS - Application Terminator
color 0C

echo =======================================================================
echo                 KAPMETA POS AND OPERATIONS PLATFORM - SHUTDOWN
echo =======================================================================
echo.
echo Stopping all running services (API Gateway, POS Web, Admin Portal)...
echo Releasing ports 4001, 4444, 4445...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\shutdown.ps1

echo.
pause
