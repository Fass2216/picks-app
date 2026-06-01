@echo off
cd /d "%~dp0"
del /f .git\index.lock 2>nul
git config user.email "fass216@gmail.com"
git config user.name "Fede"
git add App.js
git commit -m "Mis tiendas en buscar + compartir picks + organizar por tienda"
git push origin main
echo.
echo Listo! Presiona cualquier tecla para cerrar.
pause >nul
