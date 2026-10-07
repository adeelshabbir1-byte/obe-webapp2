@echo off
if not defined SOLVER_KEEP_OPEN (
  set SOLVER_KEEP_OPEN=1
  cmd /k ""%~f0""
  exit /b
)
cd /d "%~dp0"
echo Checking your computer for the timetable solver...
echo.
set "PY="
py -3 -c "import sys" >nul 2>&1
if not errorlevel 1 set "PY=py -3"
if defined PY goto have_python
python -c "import sys" >nul 2>&1
if not errorlevel 1 set "PY=python"
if defined PY goto have_python
echo [X] Python: NOT FOUND
goto the_end

:have_python
echo [OK] Python found:
%PY% --version
%PY% -c "import tkinter" >nul 2>&1
if errorlevel 1 (echo [X] tkinter is missing - reinstall Python and tick tcl/tk and IDLE) else (echo [OK] tkinter - the window toolkit)
%PY% -c "import ortools; print('[OK] ortools', ortools.__version__)" 2>nul
if errorlevel 1 echo [X] ortools is not installed yet
%PY% -c "import openpyxl; print('[OK] openpyxl', openpyxl.__version__)" 2>nul
if errorlevel 1 echo [X] openpyxl is not installed yet

:the_end
echo.
echo Send me a photo of this window if the solver still does not open.
