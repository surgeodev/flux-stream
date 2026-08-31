@echo off
setlocal EnableDelayedExpansion
cd /d %~dp0
title FLUX Streaming - Setup & Start

echo ==========================================
echo    FLUX Streaming - Installation Windows
echo ==========================================
echo.

REM ---------- Verification Node.js ----------
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'est pas installe.
    echo          Installe-le depuis https://nodejs.org puis relance.
    echo.
    pause
    exit /b 1
)

REM ---------- Verification Python ----------
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Python n'est pas installe.
    echo          Installe-le depuis https://python.org, coche "Add to PATH".
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js et Python detectes.
echo.

REM ---------- Installation des dependances ----------
if not exist node_modules (
    echo [1/5] Installation des dependances npm...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERREUR] npm install a echoue.
        pause
        exit /b 1
    )
) else (
    echo [1/5] dependances npm deja presentes
)

echo.
echo [2/5] Creation du fichier .env si absent...
if not exist .env (
    echo VITE_API_URL=http://localhost:8080> .env
    echo      - .env cree
) else (
    echo      - .env deja present
)

echo.
echo [3/5] Build du frontend (cela peut prendre quelques minutes)...
call npm run build
if %errorlevel% neq 0 (
    echo [ERREUR] build a echoue.
    pause
    exit /b 1
)

echo.
echo [4/5] Demarrage du serveur backend Python...
start "FLUX Backend" cmd /k "python server.py 8080"

echo.
echo [5/5] Serveur pret !
echo.
echo    Acces :  http://localhost:8080
echo.
echo    Note : le worker vixsrc doit tourner sur localhost:8787.
echo    Si le streaming ne marche pas, lance dans un 2eme terminal :
echo        cd worker
echo        npx wrangler dev
echo.
pause
