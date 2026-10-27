@echo off
rem Start het hulpprogramma voor het dashboard (telefoonmeldingen en Google-tokens).
rem De eerste keer installeert hij wat hij nodig heeft (duurt even). Daarna draait hij onzichtbaar op de achtergrond.
rem Draait er al een (oudere) versie, dan wordt die eerst gestopt.
cd /d "%~dp0"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name like 'python%%'\" | Where-Object { $_.CommandLine -like '*meldingen.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1
if not exist ".venv\Scripts\pythonw.exe" (
  echo Eerste keer: benodigdheden installeren...
  python -m venv .venv || (echo Python niet gevonden. Installeer Python via python.org of de Microsoft Store. & pause & exit /b 1)
  ".venv\Scripts\python.exe" -m pip install --quiet -r requirements.txt || (echo Installeren mislukt. & pause & exit /b 1)
)
start "" ".venv\Scripts\pythonw.exe" meldingen.py
echo Hulpprogramma gestart.
if not exist "tokens.json" (
  if exist "google-client.json" (
    echo Nog niet met Google gekoppeld: de koppelpagina gaat open.
    timeout /t 2 >nul
    start "" "http://127.0.0.1:8765/koppel"
  )
)
timeout /t 3 >nul
