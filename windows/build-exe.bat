@echo off
REM Build FLUX.exe - compile le launcher (racine) en executable Windows
REM Usage: double-clique ou taper  build-exe.bat  (dans le dossier windows/)
cd /d "%~dp0.."

echo ==========================================
echo    Compilation de FLUX.exe
echo ==========================================
echo.

echo [1/3] Installation de pyinstaller...
python -m pip install --upgrade pyinstaller
if %errorlevel% neq 0 (
    echo [ERREUR] pyinstaller non installe. Python doit etre dans le PATH.
    pause
    exit /b 1
)

echo [2/3] Compilation (une seule binaire, sans console)...
python -m pyinstaller --onefile --noconsole --name FLUX --distpath dist --workpath build --specpath build launcher.py
if %errorlevel% neq 0 (
    echo [ERREUR] compilation echouee.
    pause
    exit /b 1
)

echo [3/3] Termine !
echo.
echo    FLUX.exe est ici :  %~dp0..\dist\FLUX.exe
echo    Copie-le sur ton Bureau ou lance-le.
echo.
pause
