@echo off
rem Doble clic para instalar el Conector KioskPOS (llama a instalar.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
pause
