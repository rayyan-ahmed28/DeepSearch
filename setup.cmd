@echo off
rem DeepSearch one-time setup for Windows: Python packages, frontend packages, backend\.env.
rem The virtual environment lives outside OneDrive on a short path (see README, "Windows notes").
setlocal
cd /d "%~dp0"
set "VENV=%USERPROFILE%\.venvs\deepsearch"

if not exist "%VENV%\Scripts\python.exe" (
  echo Creating the Python 3.12 environment in %VENV% ...
  py -3.12 -m venv "%VENV%" || (echo Python 3.12 is needed: install it from python.org, then run setup again. & exit /b 1)
)
echo Installing backend packages (a few minutes the first time) ...
"%VENV%\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r backend\requirements-lock.txt || exit /b 1

echo Installing frontend packages ...
pushd frontend
call npm install --no-fund --no-audit || (popd & echo Node.js 18 or newer is needed: install it from nodejs.org. & exit /b 1)
popd

if not exist backend\.env (
  copy /y backend\.env.example backend\.env >nul
  echo Created backend\.env. Every key may stay blank; add free keys later if you like.
)
echo.
echo Setup done. Run start.cmd to open DeepSearch.
