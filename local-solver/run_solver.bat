@echo off
setlocal
REM Starts the Local Timetable Solver window. Installs what it needs the first time.
REM The window stays open on any problem and writes solver_log.txt next to this file.
cd /d "%~dp0"
set "LOG=%~dp0solver_log.txt"
echo Started %date% %time% > "%LOG%"

REM ---- 1. find Python (the "py" launcher first, then "python") ----
set "PY="
py -3 -c "import sys" >nul 2>&1
if not errorlevel 1 set "PY=py -3"
if "%PY%"=="" (
  python -c "import sys" >nul 2>&1
  if not errorlevel 1 set "PY=python"
)
if "%PY%"=="" (
  echo.
  echo  PYTHON IS NOT INSTALLED (or not found).
  echo  1. Install Python 3.12 from https://www.python.org/downloads/release/python-3120/
  echo  2. On the FIRST screen of the installer, tick "Add python.exe to PATH".
  echo  3. Then double-click run_solver.bat again.
  echo  Note: if typing "python" opens the Microsoft Store, that is NOT Python - install it from python.org.
  echo Python not found >> "%LOG%"
  pause
  exit /b 1
)
echo Using: %PY%
%PY% --version
%PY% --version >> "%LOG%" 2>&1

REM ---- 2. warn about Python versions the solver library may not support yet ----
%PY% -c "import sys; sys.exit(0 if (3,9)<=sys.version_info[:2]<=(3,13) else 1)" >nul 2>&1
if errorlevel 1 (
  echo.
  echo  WARNING: this Python version is very new or very old. The solver library often has no version for it.
  echo  If the install below fails, install Python 3.12 from python.org and run this file again.
  echo.
)

REM ---- 3. the window toolkit (tkinter) must exist ----
%PY% -c "import tkinter" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo  This Python was installed without the window toolkit "tkinter".
  echo  Re-run the Python installer, choose Modify, and make sure "tcl/tk and IDLE" is ticked.
  pause
  exit /b 1
)

REM ---- 4. install the two helper packages the first time ----
%PY% -c "import ortools, openpyxl" >nul 2>&1
if errorlevel 1 (
  echo First run: installing the solver components - needs internet, takes a few minutes...
  %PY% -m pip install --upgrade pip >> "%LOG%" 2>&1
  %PY% -m pip install -r requirements.txt
  if errorlevel 1 (
    echo.
    echo  The install FAILED. Common causes: no internet / a network that blocks pip / a Python version that is too new.
    echo  Try: another network, or install Python 3.12, then run this file again.
    echo  Please send me the text above or the file solver_log.txt if it keeps failing.
    pause
    exit /b 1
  )
)

REM ---- 5. open the solver window ----
%PY% timetable_solver_gui.py 2>> "%LOG%"
if errorlevel 1 (
  echo.
  echo  The solver window could not start. The error is saved in solver_log.txt - the last lines are:
  echo  ------------------------------------------------------------
  powershell -NoProfile -Command "Get-Content -Tail 15 '%LOG%'"
  echo  ------------------------------------------------------------
  pause
)
