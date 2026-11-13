@echo off
rem Starts the dashboard helper (phone notifications, media and Google tokens).
rem The first time it installs what it needs (takes a while). After that it runs invisibly in the background.
rem If an (older) version is already running, that one is stopped first (old name meldingen.py or server.py).
cd /d "%~dp0"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name like 'python%%'\" | Where-Object { ($_.CommandLine -like '*meldingen.py*' -or $_.CommandLine -like '*server.py*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1
if not exist ".venv\Scripts\pythonw.exe" (
  echo First time: installing what is needed...
  python -m venv .venv || (echo Python not found. Install Python from python.org or the Microsoft Store. & pause & exit /b 1)
)
rem Update every time: new parts (e.g. media) are added automatically this way; if everything is already there, this is quick
".venv\Scripts\python.exe" -m pip install --quiet --disable-pip-version-check -r requirements.txt || (echo Installing failed. & pause & exit /b 1)
start "" ".venv\Scripts\pythonw.exe" server.py
echo Helper started.
if not exist "tokens.json" (
  if exist "google-client.json" (
    echo Not linked to Google yet: the linking page opens.
    timeout /t 2 >nul
    start "" "http://127.0.0.1:8765/link"
  )
)
timeout /t 3 >nul
