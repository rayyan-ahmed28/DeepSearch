@echo off
rem Start the DeepSearch backend and frontend in two windows, then open the app.
setlocal
cd /d "%~dp0"
set "PY=%USERPROFILE%\.venvs\deepsearch\Scripts\python.exe"
if not exist "%PY%" (echo Run setup.cmd first. & exit /b 1)

start "DeepSearch backend (close to stop)" cmd /k ""%PY%" -m uvicorn app.main:app --app-dir backend --port 8000"
start "DeepSearch frontend (close to stop)" cmd /k "cd /d frontend && npm run dev"

echo Waiting for the servers to start ...
timeout /t 6 /nobreak >nul
start "" http://localhost:5173
echo DeepSearch is at http://localhost:5173 (API: http://localhost:8000/docs). Close the two windows to stop it.
