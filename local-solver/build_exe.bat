@echo off
REM OPTIONAL: builds a single TimetableSolver.exe you can copy to any Windows PC
REM (no Python needed on that PC). Run this once on a PC that has Python.
cd /d "%~dp0"
python -m pip install -r requirements.txt pyinstaller
python -m PyInstaller --noconfirm --onefile --windowed --name TimetableSolver --collect-all ortools timetable_solver_gui.py
echo.
echo Done. Your program is: dist\TimetableSolver.exe
pause
