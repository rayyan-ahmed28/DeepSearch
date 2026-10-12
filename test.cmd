@echo off
rem Run every automated test: backend (pytest) and frontend (Vitest + type check and build). All offline.
setlocal
cd /d "%~dp0"
set "PY=%USERPROFILE%\.venvs\deepsearch\Scripts\python.exe"
if not exist "%PY%" (echo Run setup.cmd first. & exit /b 1)

echo === Backend tests ===
pushd backend
"%PY%" -m pytest tests -q || (popd & echo BACKEND TESTS FAILED & exit /b 1)
popd

echo === Frontend tests ===
pushd frontend
call npm test || (popd & echo FRONTEND TESTS FAILED & exit /b 1)
echo === Frontend type check and build ===
call npm run build || (popd & echo FRONTEND BUILD FAILED & exit /b 1)
popd
echo.
echo All tests passed.
