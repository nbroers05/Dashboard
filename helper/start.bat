@echo off
rem Start het hulpprogramma voor telefoonmeldingen op het dashboard.
rem De eerste keer installeert hij wat hij nodig heeft (duurt even). Daarna draait hij onzichtbaar op de achtergrond.
cd /d "%~dp0"
if not exist ".venv\Scripts\pythonw.exe" (
  echo Eerste keer: benodigdheden installeren...
  python -m venv .venv || (echo Python niet gevonden. Installeer Python via python.org of de Microsoft Store. & pause & exit /b 1)
  ".venv\Scripts\python.exe" -m pip install --quiet -r requirements.txt || (echo Installeren mislukt. & pause & exit /b 1)
)
start "" ".venv\Scripts\pythonw.exe" meldingen.py
echo Hulpprogramma gestart. Je kunt dit venster sluiten.
timeout /t 3 >nul
