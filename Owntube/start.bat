@echo off
chcp 65001 >nul
title Owntube Launcher

echo ============================================
echo   Starting Owntube (backend + frontend)
echo ============================================
echo.

set ROOT=%~dp0

echo [1/2] Starting backend...
start "ZEX Downloader (backend)" cmd /k "cd /d "%ROOT%backend" && npm start"

timeout /t 2 /nobreak >nul

echo [2/2] Starting frontend...
start "Owntube (frontend)" cmd /k "cd /d "%ROOT%frontend" && npx serve -l 3000"

timeout /t 3 /nobreak >nul

echo.
echo Opening site...
start http://localhost:3000

echo.
echo Done. Do not close the command windows.
pause