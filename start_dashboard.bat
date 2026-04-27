@echo off
echo Starting Robo Painter Dashboard + Backend...
echo.

:: Start the Python WebSocket backend in a new window
start "Robo Painter Backend" cmd /k "cd /d %~dp0 && robo_env\Scripts\python.exe backend\server.py"

:: Wait a moment for the backend to start
timeout /t 2 /nobreak >nul

:: Start the dashboard dev server
cd dashboard
npm run dev
