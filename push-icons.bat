@echo off
cd /d "%~dp0"
del /f .git\index.lock 2>nul
git config user.email "fass216@gmail.com"
git config user.name "Fede"
git add assets/icon.png assets/splash-icon.png assets/android-icon-foreground.png app.json eas.json
git commit -m "Iconos actualizados + config iOS para EAS Build"
git push origin main
echo.
echo Listo! Presiona cualquier tecla para cerrar.
pause >nul
