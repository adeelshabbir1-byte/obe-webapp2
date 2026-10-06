@echo off
setlocal
cd /d "%~dp0"
echo Checking your computer for the timetable solver...
echo.
set "PY="
py -3 -c "import sys" >nul 2>&1
if not errorlevel 1 set "PY=py -3"
if "%PY%"=="" (
  python -c "import sys" >nul 2>&1
  if not errorlevel 1 set "PY=python"
)
if "%PY%"=="" ( echo [X] Python: NOT FOUND ) else ( echo [OK] Python found: & %PY% --version )
if not "%PY%"=="" (
  %PY% -c "import tkinter" >nul 2>&1 && echo [OK] Window toolkit (tkinter) || echo [X] tkinter missing - reinstall Python and tick "tcl/tk and IDLE"
  %PY% -c "import ortools; print('[OK] ortools', ortools.__version__)" 2>nul || echo [X] ortools not installed yet
  %PY% -c "import openpyxl; print('[OK] openpyxl', openpyxl.__version__)" 2>nul || echo [X] openpyxl not installed yet
)
echo.
echo Copy everything above and send it to me if the solver still does not open.
pause
