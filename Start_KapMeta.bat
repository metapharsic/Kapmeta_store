@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title KapMeta POS - KapMeta Application Launcher
color 0A

echo =======================================================================
echo                 KAPMETA POS AND OPERATIONS PLATFORM - LAUNCHER
echo =======================================================================
echo.
echo [CONFIG] Fixed Ports and Endpoints:
echo  - POS Web UI (Frontend)   : http://localhost:4444 (PORT/APP_PORT/POS_PORT)
echo  - API Gateway (Backend)   : http://localhost:4001 (API_PORT)
echo  - Local Database Check    : localhost:5432 (kapmeta)
echo  - Redis Cache             : localhost:6379
echo.

:: 1. Define and Set all inline Environment Variables in Sync
set NODE_ENV=development
set PORT=4444
set APP_PORT=4444
set POS_PORT=4444
set API_PORT=4001
set ADMIN_PORT=4445
set DB_PORT=5432
set REDIS_PORT=6379
set LOG_LEVEL=debug
set DATABASE_URL=postgresql://pos:pos@localhost:5432/kapmeta
set DATABASE_POOL_MAX=20
set REDIS_URL=redis://localhost:6379
set QUEUE_URL=amqp://localhost:5672
set S3_ENDPOINT=http://localhost:9000
set S3_BUCKET=pos-documents
set S3_ACCESS_KEY=dev_access_key
set S3_SECRET_KEY=dev_secret_key
set JWT_SECRET=dev_jwt_secret_key_minimum_32_characters_long
set JWT_ACCESS_TTL=15m
set JWT_REFRESH_TTL=7d
set SWIGGY_API_BASE=https://api.swiggy.com
set ZOMATO_API_BASE=https://api.zomato.com
set PAYMENT_GATEWAY=razorpay
set OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
set CREDENTIALS_ENCRYPTION_KEY=dev_only_channel_credentials_key_change_in_prod

:: 2. Ensure log folders, checkpoints, agents, and brain exist
if not exist logs mkdir logs
if not exist logs\app mkdir logs\app
if not exist logs\api mkdir logs\api
if not exist logs\pos-web mkdir logs\pos-web
if not exist logs\admin-web mkdir logs\admin-web
if not exist logs\database mkdir logs\database
if not exist logs\agents mkdir logs\agents
if not exist logs\errors mkdir logs\errors
if not exist logs\audit mkdir logs\audit
if not exist logs\archive mkdir logs\archive
if not exist checkpoints mkdir checkpoints
if not exist checkpoints\milestones mkdir checkpoints\milestones
if not exist agents mkdir agents
if not exist brain mkdir brain

:: 3. Launch application runner and process orchestrator
echo [LAUNCH] Executing application runner and process orchestrator...
node .\scripts\startup.js

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo =======================================================================
    echo [ERROR] Application launcher exited with an error code (%errorlevel%).
    echo Check logs in .\logs\ for diagnostic details.
    echo =======================================================================
    echo.
    pause
)
