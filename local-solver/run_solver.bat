@echo off
REM Starts the Local Timetable Solver window. Installs what it needs the first time.
REM This window stays open no matter what, and everything is saved to solver_log.txt.
if not defined SOLVER_KEEP_OPEN (
  set SOLVER_KEEP_OPEN=1
  cmd /k ""%~f0""
  exit /b
)
cd /d "%~dp0"
set "LOG=%~dp0solver_log.txt"
echo Started %date% %time% > "%LOG%"

set "PY="
py -3 -c "import sys" >nul 2>&1
if not errorlevel 1 set "PY=py -3"
if defined PY goto have_python
python -c "import sys" >nul 2>&1
if not errorlevel 1 set "PY=python"
if defined PY goto have_python

echo.
echo  PYTHON IS NOT INSTALLED, or Windows cannot find it.
echo  1. Install Python 3.12 from https://www.python.org/downloads/release/python-3120/
echo  2. On the FIRST screen of the installer, tick "Add python.exe to PATH".
echo  3. Close this window and double-click run_solver.bat again.
echo  If typing "python" opens the Microsoft Store, that is NOT Python. Install it from python.org.
echo Python not found >> "%LOG%"
goto the_end

:have_python
echo Using: %PY%
%PY% --version
%PY% --version >> "%LOG%" 2>&1

%PY% -c "import tkinter" >> "%LOG%" 2>&1
if errorlevel 1 goto no_tk

%PY% -c "import ortools, openpyxl" >nul 2>&1
if not errorlevel 1 goto start_gui

echo.
echo First run: installing the solver components. This needs internet and takes a few minutes...
%PY% -m pip install --upgrade pip >> "%LOG%" 2>&1
%PY% -m pip install -r requirements.txt
if errorlevel 1 goto install_failed

:start_gui
echo.
echo Starting the solver window...
%PY% timetable_solver_gui.py 2>> "%LOG%"
if errorlevel 1 goto gui_failed
goto the_end

:no_tk
echo.
echo  This Python was installed without the window toolkit called tkinter.
echo  Run the Python installer again, choose Modify, and tick "tcl/tk and IDLE".
goto the_end

:install_failed
echo.
echo  The install FAILED. Common causes: no internet, a network that blocks pip, or a Python version that is too new.
echo  Try another network, or install Python 3.12 from python.org, then run this file again.
goto the_end

:gui_failed
echo.
echo  The solver window could not start. The last lines of solver_log.txt are:
echo  ------------------------------------------------------------
powershell -NoProfile -Command "Get-Content -Tail 15 '%LOG%'"
echo  ------------------------------------------------------------
goto the_end

:the_end
echo.
echo  This window stays open so you can read the messages above.
echo  If you need help, send me a photo of this window or the file solver_log.txt.
echo  Close this window when you are done.
