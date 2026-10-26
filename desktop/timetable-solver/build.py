"""Builds the single-file app with PyInstaller: dist/OBEHUB-Timetable-Solver(.exe).

  python -m pip install -r requirements-dev.txt
  python build.py
"""
import platform
import subprocess
import sys

NAME = "OBEHUB-Timetable-Solver"

args = [
    sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile", "--windowed", "--name", NAME,
    "--collect-all", "ortools",  # the CP-SAT native library and its data
    "--hidden-import", "reportlab.graphics.barcode.common",
    "--exclude-module", "tkinter", "--exclude-module", "matplotlib", "--exclude-module", "pytest",
    "run_solver.py",
]
if platform.system() == "Darwin":
    args.insert(-1, "--osx-bundle-identifier")
    args.insert(-1, "pk.obehub.timetablesolver")
sys.exit(subprocess.call(args))
