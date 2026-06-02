@echo off
REM ============================================================
REM  Servidor local para probar Salones Recorridos
REM  Abre la app en: http://localhost:8765
REM ============================================================
cd /d "%~dp0"
echo.
echo  ============================================================
echo   Salones Recorridos - Kleno
echo  ============================================================
echo.
echo   Abriendo en el navegador: http://localhost:8765
echo   (Ctrl+C en esta ventana para detener)
echo.
start "" http://localhost:8765
python -m http.server 8765
pause
