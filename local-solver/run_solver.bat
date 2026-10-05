@echo off
REM Starts the Local Timetable Solver window. Installs what it needs the first time.
cd /d "%~dp0"
python --version >nul 2>&1
if errorlevel 1 (
  echo Python is not installed. Please install it once from https://www.python.org/downloads/
  echo IMPORTANT: tick "Add python.exe to PATH" on the first screen of the installer.
  pause
  exit /b 1
)
python -c "import ortools, openpyxl" >nul 2>&1
if errorlevel 1 (
  echo First run: installing the solver components - needs internet, takes a minute...
  python -m pip install -r requirements.txt
)
python timetable_solver_gui.py
if errorlevel 1 pause
