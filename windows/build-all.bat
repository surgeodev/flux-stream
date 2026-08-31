@echo off
REM build-all.bat - compile TOUS les executables FLUX (installeur + launcher)
REM Usage: double-clique sur ce .bat DANS UNE COPIE LOCALE du repo
cd /d "%~dp0"

echo ==========================================
echo   Compilation de tous les executables FLUX
echo ==========================================
echo.

echo [1/3] Installation de pyinstaller...
python -m pip install --upgrade pyinstaller
if %errorlevel% neq 0 (
    echo [ERREUR] pyinstaller non installe. Python doit etre dans le PATH.
    pause
    exit /b 1
)

echo.
echo [2/3] Compilation de l'INSTALLATEUR (install-flux.exe)...
python -m pyinstaller --onefile --console --name install-flux --distpath dist --workpath build --specpath build windows/install_flux.py
if %errorlevel% neq 0 (
    echo [ERREUR] compilation installateur echouee.
    pause
    exit /b 1
)

echo.
echo [3/3] Compilation du LAUNCHER (FLUX.exe)...
python -m pyinstaller --onefile --noconsole --name FLUX --distpath dist --workpath build --specpath build launcher.py
if %errorlevel% neq 0 (
    echo [ERREUR] compilation launcher echouee.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo   TERMINE !
echo ==========================================
echo.
echo   Executables dans le dossier "dist":
echo.
echo     dist\install-flux.exe   -> A DISTRIBUER / PREMIERE install (a double-cliquer)
echo     dist\FLUX.exe           -> Pour LANCER flux (a double-cliquer)
echo.
echo   Workflow :
echo     1) Double-clique sur install-flux.exe   (desinstalle l'ancienne + installe + cree FLUX.exe)
echo     2) Double-clique sur FLUX.exe           (a chaque fois que tu veux FLUX)
echo.
pause
