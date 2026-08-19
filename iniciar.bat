@echo off
chcp 65001 >nul
title ProveDores
echo ============================================
echo   ProveDores - Busqueda de proveedores
echo ============================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: No se encontro npm. Instala Node.js desde https://nodejs.org
  pause
  exit /b 1
)

REM Comprobar si el servidor ya esta corriendo en el puerto 3001
powershell -ExecutionPolicy Bypass -Command "if (Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo Arrancando la app en el puerto 3001...
  start "ProveDores Server" cmd /c "npm.cmd run start -- -p 3001"
  timeout /t 8 >nul
)

echo.
echo Obteniendo enlace publico (tunel gratuito de Cloudflare)...
echo.

set LOG=%TEMP%\cf-tunnel.log
if exist "%LOG%" del "%LOG%" 2>nul
start /min "ProveDores Tunel" "%LOCALAPPDATA%\cloudflared.exe" tunnel --url http://localhost:3001 --no-autoupdate
timeout /t 12 >nul

echo.
echo ============================================
for /f "usebackq tokens=*" %%L in (`powershell -ExecutionPolicy Bypass -Command "Get-Content '$env:TEMP\cf-tunnel.log' -ErrorAction SilentlyContinue | Select-String -Pattern 'trycloudflare.com' | Select-Object -Last 1"`) do (
  echo  ENLACE PUBLICO: %%L
)
echo.
echo  Mientras este PC este encendido, abre ese enlace en
echo  cualquier dispositivo (movil, tablet, otro PC).
echo  Si reinicias este PC, ejecuta este archivo otra vez.
echo ============================================
echo.
echo  Abriendo la app en este PC (localhost:3001)...
start http://localhost:3001
pause