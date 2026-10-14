@echo off
chcp 65001 >nul
title Csámpázó - Mobil & PC Web Csomag Szerver
echo =================================================================
echo   🚀 CSÁMPÁZÓ - SM Sétakövető Web Csomag Szerver
echo =================================================================
echo.
echo   Indítás böngészőben...
echo.
start "" "http://localhost:8085/"
python "%~dp0server.py"
if %errorlevel% neq 0 (
    py "%~dp0server.py"
    if %errorlevel% neq 0 (
        echo Python nem elérhető, próbálkozás PowerShell-lel...
        powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 8085
    )
)
pause
