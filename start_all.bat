@echo off
echo [NEON] Starte System (Lokaler Modus)...

:: 1. Backend starten (versteckt im Hintergrund mit VBScript)
echo [NEON] Starte Backend Server (Node.js + Chroma)...
start /B wscript //B start_hidden.vbs "%CD%\backend"

:: 2. Frontend starten (versteckt im Hintergrund mit VBScript)
echo [NEON] Starte Frontend Server (Vite/React)...
start /B wscript //B start_hidden.vbs "%CD%\frontend"

echo [NEON] Alles gestartet!
echo Backend lauft auf Port 3001
echo Frontend lauft auf http://localhost:5173
pause
