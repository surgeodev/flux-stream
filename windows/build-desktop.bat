@echo off
REM build-desktop.bat - compile FLUX-Desktop.exe (app WebView)
REM Double-clique sur ce fichier.
cd /d "%~dp0"

echo ==========================================
echo   Compilation de FLUX-Desktop.exe
echo ==========================================
echo.

REM -------- trouvons un Python qui marche --------
set PY=python
where python >nul 2>&1 && goto found
set PY=py -3
where py >nul 2>&1 && goto found
echo [ERREUR] Aucun Python trouve. Installe-le depuis https://python.org
echo          et COCHE "Add Python to PATH" pendant l'installation.
pause
exit /b 1

:found
echo Utilisation de : %PY%

echo.
echo [1/4] Installation de pyinstaller + pywebview...
%PY% -m pip install --upgrade pyinstaller pywebview
if %errorlevel% neq 0 (
    echo [ERREUR] pip a echoue. Essaie :  %PY% -m pip install --user pyinstaller pywebview
    pause
    exit /b 1
)

echo.
echo [2/4] Build du frontend (si besoin)...
if not exist dist\index.html (
    call npm run build
)

echo.
echo [3/4] Compilation de l'application...
%PY% -m pyinstaller --onefile --windowed --name "FLUX-Desktop" webview_app.py
if %errorlevel% neq 0 (
    echo [ERREUR] compilation echouee. Voici l'erreur ci-dessus.
    pause
    exit /b 1
)

echo.
echo [4/4] Termine !
echo.
echo   FLUX-Desktop.exe est ici :  %~dp0dist\FLUX-Desktop.exe
echo   Double-clique dessus pour ouvrir FLUX dans une fenetre.
echo.
pause
