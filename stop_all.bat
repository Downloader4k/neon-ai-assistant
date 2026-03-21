@echo off
echo [NEON] Stoppe System...

echo Beende alle laufenden Node.js Prozesse (Frontend + Backend)
taskkill /F /IM node.exe

echo [NEON] System gestoppt.
pause
