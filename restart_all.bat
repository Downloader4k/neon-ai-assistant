@echo off
echo [NEON] Starte kompletten Neustart...

call stop_all.bat
timeout /t 3
call start_all.bat
