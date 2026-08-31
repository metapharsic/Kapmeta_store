@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title KapMeta POS - System Status
color 0B

powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\status.ps1

pause
