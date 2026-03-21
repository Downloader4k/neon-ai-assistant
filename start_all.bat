@echo off
echo [NEON] Starte System (Web-App Modus)...
echo.

:: 1. Backend starten (versteckt im Hintergrund)
echo [NEON] Starte Backend Server (Express + WebSocket)...
start /B wscript //B start_hidden.vbs "%CD%\backend"

:: 2. Frontend starten (versteckt im Hintergrund)
echo [NEON] Starte Frontend Server (Vite/React)...
start /B wscript //B start_hidden.vbs "%CD%\frontend"

echo.
echo [NEON] Alles gestartet!
echo.
echo   Lokal:    http://localhost:5173
echo   Netzwerk: http://%COMPUTERNAME%:5173
echo   Backend:  http://localhost:3001
echo.
echo   Erreichbar von jedem Geraet im Netzwerk!
echo.
pause
