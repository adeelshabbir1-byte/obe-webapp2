"""Entry point for the packaged app (PyInstaller) and for `python run_solver.py`."""
import multiprocessing
import sys

from ttsolver.__main__ import run

if __name__ == "__main__":
    multiprocessing.freeze_support()
    sys.exit(run())
