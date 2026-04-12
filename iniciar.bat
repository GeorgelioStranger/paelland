@echo off
title Sistema Paella - Automático
echo ======================================
echo   Iniciando Sistema de Pedidos Paella
echo ======================================
echo.

:: Cerrar procesos previos que usen el puerto 3001
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3001" ^| find "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

:: Iniciar el backend
start "Backend Paella" cmd /k node server.js

:: Esperar 3 segundos
timeout /t 3 /nobreak >nul

:: Abrir navegador
start http://localhost:3001

echo.
echo Sistema corriendo. Cierra esta ventana cuando quieras apagar.
pause >nul
