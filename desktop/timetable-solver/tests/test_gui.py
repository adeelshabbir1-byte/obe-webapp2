"""The app, driven headless (Qt offscreen): open → generate → views → a refused clash move → a good move → export."""
import os
import time

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtWidgets import QApplication, QFileDialog, QMessageBox  # noqa: E402

from ttsolver.checker import check  # noqa: E402
from ttsolver.io_xlsx import assignment_from_solution, read_solution  # noqa: E402
from ttsolver.model import Placement  # noqa: E402
from ttsolver.sample import tiny_problem, write_constraints  # noqa: E402


def wait_for(win, cond, limit=60):
    t = time.time()
    while not cond() and time.time() - t < limit:
        QApplication.processEvents()
        time.sleep(0.02)
    assert cond(), "timed out"


def test_app_end_to_end(tmp_path, monkeypatch):
    from ttsolver.gui import MainWindow
    app = QApplication.instance() or QApplication([])
    monkeypatch.setattr(QMessageBox, "information", lambda *a, **k: None)
    monkeypatch.setattr(QMessageBox, "warning", lambda *a, **k: None)
    src = os.path.join(tmp_path, "timetable-constraints.xlsx")
    write_constraints(src, tiny_problem())
    win = MainWindow()
    win.load(src)
    assert win.problem is not None and win.tabs.isTabEnabled(2)
    win.time_limit.setValue(10)
    win.generate()
    wait_for(win, lambda: win.thread is None and win.result is not None)
    assert win.result.ok, win.result_text.toPlainText()
    assert "0 hard violations" in win.result_text.toPlainText()
    assert win.grid.rowCount() > 0 and win.entity.count() >= 2

    # A move that clashes is refused with the reason: put CS101 (B1) on top of the combined MA101 (B1, B2).
    a = win.assignment
    clash = Placement(a[2].day, a[2].start, a[0].room_id)
    before = dict(win.assignment)
    win.try_move(0, clash.day, clash.start)
    assert win.assignment == before
    assert "Not moved" in win.move_msg.text()

    # A legal move goes through and locks the class.
    p = win.problem
    moved = False
    for d in ("Mon", "Tue", "Wed"):
        for t in range(16, 25):
            from ttsolver.checker import move_problems
            cand = Placement(d, t, a[5].room_id)
            if (d, t) != (a[5].day, a[5].start) and not move_problems(p, win.assignment, 5, cand):
                win.try_move(5, d, t)
                moved = True
                break
        if moved:
            break
    assert moved and 5 in win.locked and check(p, win.assignment) == []

    # Re-optimise around the locked change keeps it.
    win.reoptimise()
    wait_for(win, lambda: win.thread is None)
    assert win.result.ok and win.assignment[5] == win.locked[5]

    out = os.path.join(tmp_path, "timetable-solution.xlsx")
    pdf = os.path.join(tmp_path, "timetable.pdf")
    monkeypatch.setattr(QFileDialog, "getSaveFileName", staticmethod(lambda *a, **k: (out, "")))
    win.save_solution()
    monkeypatch.setattr(QFileDialog, "getSaveFileName", staticmethod(lambda *a, **k: (pdf, "")))
    win.save_pdf()
    rows, summary = read_solution(out)
    assert len(rows) == len(p.slots) and summary["hardViolations"] == 0
    assert check(p, assignment_from_solution(rows)) == []
    assert os.path.getsize(pdf) > 2000
    win.close()
