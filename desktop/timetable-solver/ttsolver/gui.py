"""The desktop app (PySide6): Open → Settings → Generate → Views → Export."""
from __future__ import annotations

import os
import sys
import time

from PySide6.QtCore import QObject, QSettings, Qt, QThread, QTimer, Signal
from PySide6.QtGui import QAction, QBrush, QColor, QFont, QKeySequence
from PySide6.QtWidgets import (
    QAbstractItemView, QApplication, QCheckBox, QComboBox, QDoubleSpinBox, QFileDialog, QFormLayout, QGridLayout, QGroupBox,
    QHBoxLayout, QHeaderView, QLabel, QListWidget, QMainWindow, QMessageBox, QPlainTextEdit, QPushButton, QSpinBox, QSplitter,
    QTableWidget, QTableWidgetItem, QTabWidget, QVBoxLayout, QWidget,
)

from . import __version__
from .checker import check, move_problems
from .io_xlsx import assignment_from_solution, read_constraints, read_solution, write_solution
from .model import Assignment, Placement, Problem, fmt_time
from .precheck import precheck
from .report import explain, grid_blocks, write_pdf
from .softscore import soft_breakdown
from .solver import DEFAULT_WEIGHTS, WEIGHT_LABELS, Progress, Result, Settings, Solver, summarize_violations

APP = "OBEHUB Timetable Solver"
GREEN, RED, AMBER, NAVY = "#1E6B34", "#B3261E", "#8A5A0F", "#0D2A4A"


def _label(text: str, bold=False, color: str | None = None, size: int | None = None) -> QLabel:
    lb = QLabel(text)
    lb.setWordWrap(True)
    f = lb.font()
    if bold:
        f.setBold(True)
    if size:
        f.setPointSize(size)
    lb.setFont(f)
    if color:
        lb.setStyleSheet(f"color:{color}")
    return lb


class SolveWorker(QObject):
    progress = Signal(object)
    finished = Signal(object)

    def __init__(self, problem: Problem, settings: Settings, fixed=None, hints=None):
        super().__init__()
        self.solver = Solver(problem, settings)
        self.fixed, self.hints = fixed, hints

    def run(self) -> None:
        try:
            res = self.solver.solve(fixed=self.fixed, hints=self.hints, on_progress=self.progress.emit)
        except Exception as e:  # noqa: BLE001 — shown to the user instead of crashing the app
            res = Result("ERROR", None, 0, 0, 0, reasons=[f"The solver stopped with an error: {e}"])
        self.finished.emit(res)


class GridTable(QTableWidget):
    """A weekly grid. Drag a class (press, move, release on another cell) to move it; click to see why it sits there."""
    clicked_slot = Signal(int)
    move_requested = Signal(int, str, int)  # slot, day, start

    def __init__(self):
        super().__init__()
        self.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.setSelectionMode(QAbstractItemView.SingleSelection)
        self.verticalHeader().setDefaultSectionSize(30)
        self.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self._press: tuple[int, int, int] | None = None  # slot, row offset in the class
        self.days: list[str] = []
        self.times: list[int] = []

    def mousePressEvent(self, e):
        super().mousePressEvent(e)
        it = self.itemAt(e.position().toPoint())
        if it and it.data(Qt.UserRole) is not None:
            r = self.row(it)
            self._press = (int(it.data(Qt.UserRole)), r, self.rowAt(int(e.position().y())) - r)
            self.viewport().setCursor(Qt.ClosedHandCursor)
            self.clicked_slot.emit(int(it.data(Qt.UserRole)))

    def mouseReleaseEvent(self, e):
        super().mouseReleaseEvent(e)
        self.viewport().unsetCursor()
        if not self._press:
            return
        slot, row, grab = self._press
        self._press = None
        r, c = self.rowAt(int(e.position().y())), self.columnAt(int(e.position().x()))
        if r < 0 or c < 0 or (r - grab == row and self.days[c] == self._day_of(slot)):
            return
        start_row = max(0, r - grab)
        if start_row < len(self.times):
            self.move_requested.emit(slot, self.days[c], self.times[start_row])

    def _day_of(self, slot: int) -> str:
        for c in range(self.columnCount()):
            for r in range(self.rowCount()):
                it = self.item(r, c)
                if it and it.data(Qt.UserRole) == slot:
                    return self.days[c]
        return ""


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(f"{APP} {__version__}")
        self.resize(1280, 820)
        self.problem: Problem | None = None
        self.assignment: Assignment | None = None
        self.result: Result | None = None
        self.locked: dict[int, Placement] = {}
        self.thread: QThread | None = None
        self.worker: SolveWorker | None = None
        self.t0 = 0.0
        self.qs = QSettings("OBEHUB", "TimetableSolver")
        self.tabs = QTabWidget()
        self.setCentralWidget(self.tabs)
        self.tabs.addTab(self._open_tab(), "1  Open file")
        self.tabs.addTab(self._settings_tab(), "2  Settings")
        self.tabs.addTab(self._generate_tab(), "3  Generate")
        self.tabs.addTab(self._views_tab(), "4  Views")
        self.tabs.addTab(self._export_tab(), "5  Export")
        for i in range(1, 5):
            self.tabs.setTabEnabled(i, False)
        act = QAction("Open…", self, shortcut=QKeySequence.Open, triggered=self.open_constraints)
        self.addAction(act)
        self.statusBar().showMessage("Open the timetable-constraints.xlsx you downloaded from the portal (Timetable → Download constraints).")

    # ------------------------------------------------------------------ 1 Open
    def _open_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(_label("Open the file from the portal", True, NAVY, 14))
        v.addWidget(_label("On the portal: Timetable → Download constraints. Then open that timetable-constraints.xlsx here, press Generate, save timetable-solution.xlsx and upload it on the portal (Upload solution)."))
        row = QHBoxLayout()
        b = QPushButton("Open timetable-constraints.xlsx…")
        b.clicked.connect(self.open_constraints)
        row.addWidget(b)
        b2 = QPushButton("Check a solution file…")
        b2.setToolTip("Re-checks every hard rule on a timetable-solution.xlsx against the open constraints file")
        b2.clicked.connect(self.check_solution_file)
        row.addWidget(b2)
        row.addStretch()
        v.addLayout(row)
        self.file_label = _label("No file open.", color="#555")
        v.addWidget(self.file_label)
        self.summary_grid = QGridLayout()
        box = QGroupBox("What is in the file")
        box.setLayout(self.summary_grid)
        v.addWidget(box)
        self.open_msgs = QPlainTextEdit()
        self.open_msgs.setReadOnly(True)
        v.addWidget(_label("Problems found in the file", True))
        v.addWidget(self.open_msgs, 1)
        return w

    def open_constraints(self) -> None:
        path, _ = QFileDialog.getOpenFileName(self, "Open timetable-constraints.xlsx", self.qs.value("dir", ""), "Excel files (*.xlsx)")
        if path:
            self.load(path)

    def load(self, path: str) -> None:
        self.qs.setValue("dir", os.path.dirname(path))
        res = read_constraints(path)
        self.file_label.setText(path)
        lines: list[str] = []
        if res.errors:
            lines += ["The file can't be used until these are fixed:"] + [f"  • {e}" for e in res.errors]
        if res.warnings:
            lines += ["Warnings:"] + [f"  • {e}" for e in res.warnings]
        self.problem, self.assignment, self.result, self.locked = res.problem, None, None, {}
        while self.summary_grid.count():
            self.summary_grid.takeAt(0).widget().deleteLater()
        if res.problem:
            p = res.problem
            facts = [("Sessions (slots)", len(p.slots)), ("Sections", len(p.sections)), ("Batches", len(p.batches)), ("Instructors", len(p.instructors)),
                     ("Rooms", len(p.rooms)), ("Unavailable windows", len(p.unavailability)), ("Days", ", ".join(p.days)),
                     ("Teaching hours a week", f"{sum(s.duration for s in p.slots) / 2:g}")]
            for i, (k, val) in enumerate(facts):
                self.summary_grid.addWidget(_label(k), i // 4, (i % 4) * 2)
                self.summary_grid.addWidget(_label(str(val), True), i // 4, (i % 4) * 2 + 1)
            reasons = precheck(p, int(self.qs.value("maxs", 50)))
            if reasons:
                lines += ["", "A clash-free timetable is impossible with this file:"] + [f"  • {r}" for r in reasons]
            elif not res.errors:
                lines.append("No problems found. Go to Generate.")
        self.open_msgs.setPlainText("\n".join(lines) or "No problems found.")
        ok = res.problem is not None
        for i in (1, 2):
            self.tabs.setTabEnabled(i, ok)
        for i in (3, 4):
            self.tabs.setTabEnabled(i, False)
        self.statusBar().showMessage("File loaded." if ok else "The file has problems — see the list.")
        if ok:
            self.gen_status.setText("Ready. Press Generate.")
            self.result_text.clear()

    def check_solution_file(self) -> None:
        if not self.problem:
            QMessageBox.information(self, APP, "Open the constraints file first — the solution is checked against it.")
            return
        path, _ = QFileDialog.getOpenFileName(self, "Open timetable-solution.xlsx", self.qs.value("dir", ""), "Excel files (*.xlsx)")
        if not path:
            return
        try:
            rows, summary = read_solution(path)
        except Exception as e:  # noqa: BLE001
            QMessageBox.warning(self, APP, f"Can't read that file: {e}")
            return
        a = assignment_from_solution(rows)
        v = check(self.problem, a)
        msg = [f"{len(rows)} rows for {len(self.problem.slots)} sessions.", f"Hard violations found by the checker: {len(v)} (the file's Summary says {summary['hardViolations']:g})."]
        msg += summarize_violations(v, 15)
        if not v and len(rows) == len(self.problem.slots):
            self.assignment, self.result = a, Result("CHECKED", a, soft_score(self.problem, a, self.settings()), 0, 0)
            self._after_solution()
            msg.append("This timetable is clash-free. It is now shown under Views and can be edited or exported.")
        QMessageBox.information(self, "Solution check", "\n".join(msg))

    # ------------------------------------------------------------------ 2 Settings
    def _settings_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(_label("Settings", True, NAVY, 14))
        form = QFormLayout()
        self.time_limit = QSpinBox(minimum=10, maximum=3600, value=int(self.qs.value("time", 120)), suffix=" s")
        self.workers = QSpinBox(minimum=1, maximum=256, value=int(self.qs.value("workers", os.cpu_count() or 4)))
        self.max_batch = QDoubleSpinBox(minimum=1, maximum=12, singleStep=0.5, value=float(self.qs.value("maxb", 6)), suffix=" h")
        self.max_teacher = QDoubleSpinBox(minimum=1, maximum=12, singleStep=0.5, value=float(self.qs.value("maxt", 5)), suffix=" h")
        self.max_row = QDoubleSpinBox(minimum=1, maximum=8, singleStep=0.5, value=float(self.qs.value("maxr", 3)), suffix=" h")
        self.max_section = QSpinBox(minimum=5, maximum=500, value=int(self.qs.value("maxs", 50)), suffix=" students")
        form.addRow("Time limit", self.time_limit)
        form.addRow("Workers (CPU threads)", self.workers)
        form.addRow("Most hours a day for a batch", self.max_batch)
        form.addRow("Most hours a day for a teacher", self.max_teacher)
        form.addRow("Most hours in a row without a break", self.max_row)
        form.addRow("Most students in one section (the portal's limit)", self.max_section)
        v.addLayout(form)
        box = QGroupBox("Soft rules — weight (0 = ignore; higher = more important). Hard rules always hold.")
        f2 = QFormLayout(box)
        self.weights: dict[str, QSpinBox] = {}
        for k, label in WEIGHT_LABELS.items():
            sp = QSpinBox(minimum=0, maximum=100, value=int(self.qs.value(f"w_{k}", DEFAULT_WEIGHTS[k])))
            self.weights[k] = sp
            f2.addRow(label, sp)
        v.addWidget(box)
        reset = QPushButton("Reset to defaults")
        reset.clicked.connect(self._reset_settings)
        v.addWidget(reset, alignment=Qt.AlignLeft)
        v.addStretch()
        return w

    def _reset_settings(self) -> None:
        self.time_limit.setValue(120)
        self.workers.setValue(os.cpu_count() or 4)
        self.max_batch.setValue(6)
        self.max_teacher.setValue(5)
        self.max_row.setValue(3)
        self.max_section.setValue(50)
        for k, sp in self.weights.items():
            sp.setValue(DEFAULT_WEIGHTS[k])

    def settings(self) -> Settings:
        st = Settings(time_limit=self.time_limit.value(), workers=self.workers.value(), weights={k: sp.value() for k, sp in self.weights.items()},
                      max_batch_hours=self.max_batch.value(), max_teacher_hours=self.max_teacher.value(), max_in_a_row=self.max_row.value(), max_section=self.max_section.value())
        for key, val in (("time", st.time_limit), ("workers", st.workers), ("maxb", st.max_batch_hours), ("maxt", st.max_teacher_hours), ("maxr", st.max_in_a_row), ("maxs", st.max_section)):
            self.qs.setValue(key, val)
        for k, val in st.weights.items():
            self.qs.setValue(f"w_{k}", val)
        return st

    # ------------------------------------------------------------------ 3 Generate
    def _generate_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(_label("Generate", True, NAVY, 14))
        row = QHBoxLayout()
        self.gen_btn = QPushButton("Generate")
        self.gen_btn.setStyleSheet(f"QPushButton{{background:{NAVY};color:white;padding:6px 18px;font-weight:bold}}")
        self.gen_btn.clicked.connect(lambda: self.generate())
        self.stop_btn = QPushButton("Stop (keep the best so far)")
        self.stop_btn.setEnabled(False)
        self.stop_btn.clicked.connect(self.stop)
        row.addWidget(self.gen_btn)
        row.addWidget(self.stop_btn)
        row.addStretch()
        v.addLayout(row)
        g = QGridLayout()
        self.lbl_elapsed, self.lbl_score, self.lbl_hard, self.lbl_msg = _label("—", True), _label("—", True), _label("—", True), _label("")
        for i, (k, lb) in enumerate((("Elapsed", self.lbl_elapsed), ("Best score so far (lower is better)", self.lbl_score), ("Hard violations", self.lbl_hard))):
            g.addWidget(_label(k), 0, i * 2)
            g.addWidget(lb, 0, i * 2 + 1)
        v.addLayout(g)
        v.addWidget(self.lbl_msg)
        self.gen_status = _label("Open a file first.", True)
        v.addWidget(self.gen_status)
        self.result_text = QPlainTextEdit()
        self.result_text.setReadOnly(True)
        v.addWidget(self.result_text, 1)
        self.timer = QTimer(self, interval=250, timeout=self._tick)
        return w

    def generate(self, fixed: dict[int, Placement] | None = None, hints: Assignment | None = None) -> None:
        if not self.problem or self.thread:
            return
        self.tabs.setCurrentIndex(2)
        st = self.settings()
        self.gen_btn.setEnabled(False)
        self.stop_btn.setEnabled(True)
        self.result_text.clear()
        self.lbl_score.setText("—")
        self.lbl_hard.setText("—")
        self.gen_status.setText("Working…")
        self.gen_status.setStyleSheet("")
        self.t0 = time.time()
        self.timer.start()
        self.thread = QThread()
        self.worker = SolveWorker(self.problem, st, fixed, hints)
        self.worker.moveToThread(self.thread)
        self.thread.started.connect(self.worker.run)
        self.worker.progress.connect(self._progress)
        self.worker.finished.connect(self._finished)
        self.thread.start()

    def stop(self) -> None:
        if self.worker:
            self.worker.solver.stop()
            self.stop_btn.setEnabled(False)
            self.lbl_msg.setText("Stopping — keeping the best timetable found so far…")

    def _tick(self) -> None:
        self.lbl_elapsed.setText(f"{time.time() - self.t0:.0f} s")

    def _progress(self, pr: Progress) -> None:
        if pr.objective is not None:
            self.lbl_score.setText(f"{pr.objective:,.0f}")
        if pr.hard_violations is not None:
            self.lbl_hard.setText(str(pr.hard_violations))
            self.lbl_hard.setStyleSheet(f"color:{GREEN if pr.hard_violations == 0 else RED}")
        if pr.message:
            self.lbl_msg.setText(pr.message)

    def _finished(self, res: Result) -> None:
        self.timer.stop()
        self._tick()
        self.thread.quit()
        self.thread.wait()
        self.thread, self.worker = None, None
        self.gen_btn.setEnabled(True)
        self.stop_btn.setEnabled(False)
        self.result = res
        p = self.problem
        lines: list[str] = []
        if res.ok:
            self.assignment = res.assignment
            self.lbl_score.setText(f"{res.objective:,.0f}")
            self.lbl_hard.setText("0")
            self.lbl_hard.setStyleSheet(f"color:{GREEN}")
            status = {"SOLVED": "Clash-free timetable — the best possible for these weights.", "FEASIBLE": "Clash-free timetable (best found in the time limit).",
                      "STOPPED": "Stopped — clash-free timetable (best found so far)."}.get(res.status, "Clash-free timetable.")
            self.gen_status.setText(status)
            self.gen_status.setStyleSheet(f"color:{GREEN}")
            lines += [f"{len(p.slots)} sessions placed · 0 hard violations (checked independently) · score {res.objective:,.0f} · {res.elapsed:.0f} s · {res.branches:,} solver branches", "",
                      "Soft rules (what each costs):"]
            b = soft_breakdown(p, res.assignment, self.settings())
            w = self.settings().weights
            for k, label in WEIGHT_LABELS.items():
                lines.append(f"  {label}: {b[k]} × weight {w[k]} = {b[k] * w[k]}")
            lines += ["", "Next: look at the Views, then Export the solution and upload it on the portal."]
            self._after_solution()
        else:
            self.gen_status.setText("No clash-free timetable." if res.status != "INVALID" else "Your fixed changes break the rules.")
            self.gen_status.setStyleSheet(f"color:{RED}")
            self.lbl_hard.setText("—")
            lines += ["Why:"] + [f"  • {r}" for r in res.reasons]
            if res.assignment is not None and res.violations:  # should never happen: the checker caught a solver mistake
                lines += ["", "The checker found problems in the solver's timetable, so it is not offered for export:"] + summarize_violations(res.violations)
            if res.relaxed_violations:
                lines += ["", "To place every session, these rules would have to break (exactly where):"] + summarize_violations(res.relaxed_violations)
                lines += ["", "This relaxed timetable is NOT a valid solution. You can look at it under Views; it can only be exported if you tick 'Export with violations' on Export."]
                self.assignment = res.relaxed_assignment
                self._after_solution(relaxed=True)
        self.result_text.setPlainText("\n".join(lines))

    def _after_solution(self, relaxed: bool = False) -> None:
        self.tabs.setTabEnabled(3, True)
        self.tabs.setTabEnabled(4, True)
        self.export_violations.setEnabled(relaxed or bool(self.current_violations()))
        self.refresh_views()
        self.refresh_export()

    def current_violations(self):
        return check(self.problem, self.assignment) if self.problem and self.assignment else []

    # ------------------------------------------------------------------ 4 Views
    def _views_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        top = QHBoxLayout()
        self.kind = QComboBox()
        self.kind.addItems(["By batch", "By instructor", "By room"])
        self.entity = QComboBox()
        self.entity.setMinimumWidth(320)
        top.addWidget(_label("Show"))
        top.addWidget(self.kind)
        top.addWidget(self.entity)
        top.addStretch()
        self.reopt_btn = QPushButton("Re-optimise around my fixed changes")
        self.reopt_btn.setEnabled(False)
        self.reopt_btn.clicked.connect(self.reoptimise)
        self.unlock_btn = QPushButton("Unlock all")
        self.unlock_btn.clicked.connect(self._unlock)
        top.addWidget(self.unlock_btn)
        top.addWidget(self.reopt_btn)
        v.addLayout(top)
        v.addWidget(_label("Drag a class to another day or time to move it (rooms: pick one on the right). Moves that would cause a clash are refused with the reason. Moved classes are locked (🔒) for re-optimising.", color="#555"))
        split = QSplitter()
        self.grid = GridTable()
        self.grid.clicked_slot.connect(self.show_details)
        self.grid.move_requested.connect(self.try_move)
        split.addWidget(self.grid)
        side = QWidget()
        sv = QVBoxLayout(side)
        self.details = QPlainTextEdit()
        self.details.setReadOnly(True)
        sv.addWidget(_label("Why this class sits here", True))
        sv.addWidget(self.details, 1)
        rr = QHBoxLayout()
        self.room_pick = QComboBox()
        self.room_btn = QPushButton("Move to this room")
        self.room_btn.clicked.connect(self.change_room)
        rr.addWidget(self.room_pick, 1)
        rr.addWidget(self.room_btn)
        sv.addLayout(rr)
        self.move_msg = _label("", color=RED)
        sv.addWidget(self.move_msg)
        split.addWidget(side)
        split.setSizes([900, 360])
        v.addWidget(split, 1)
        self.kind.currentIndexChanged.connect(self._fill_entities)
        self.entity.currentIndexChanged.connect(self._draw)
        self.selected: int | None = None
        return w

    def refresh_views(self) -> None:
        keep = self.entity.currentData()
        self._fill_entities(keep=keep)

    def _fill_entities(self, *_, keep=None) -> None:
        if not self.problem or not self.assignment:
            return
        kind = ("batch", "instructor", "room")[self.kind.currentIndex()]
        self.blocks = grid_blocks(self.problem, self.assignment, kind)
        self.entity.blockSignals(True)
        self.entity.clear()
        for b in self.blocks:
            self.entity.addItem(b.title, b.key)
        if keep is not None:
            i = self.entity.findData(keep)
            if i >= 0:
                self.entity.setCurrentIndex(i)
        self.entity.blockSignals(False)
        self._draw()

    def _draw(self) -> None:
        g = self.grid
        g.clearSpans()
        g.clear()
        i = self.entity.currentIndex()
        if i < 0 or i >= len(getattr(self, "blocks", [])):
            g.setRowCount(0)
            g.setColumnCount(0)
            return
        b = self.blocks[i]
        g.days, g.times = b.days, b.times
        g.setColumnCount(len(b.days))
        g.setRowCount(len(b.times))
        g.setHorizontalHeaderLabels(b.days)
        g.setVerticalHeaderLabels([fmt_time(t) for t in b.times])
        for e in b.entries:
            r, c = b.times.index(e.start), b.days.index(e.day)
            it = QTableWidgetItem(("🔒 " if e.slot_index in self.locked else "") + e.text)
            it.setData(Qt.UserRole, e.slot_index)
            it.setBackground(QBrush(QColor(e.color)))
            it.setToolTip(e.text)
            it.setTextAlignment(Qt.AlignTop | Qt.AlignLeft)
            if e.slot_index == self.selected:
                f = QFont()
                f.setBold(True)
                it.setFont(f)
            g.setItem(r, c, it)
            if e.length > 1:
                g.setSpan(r, c, min(e.length, len(b.times) - r), 1)

    def show_details(self, slot: int) -> None:
        if not self.problem or not self.assignment:
            return
        self.selected = slot
        self.move_msg.setText("")
        lines = explain(self.problem, self.assignment, slot)
        mine = [v for v in self.current_violations() if slot in v.slots]
        if mine:
            lines += ["", "Broken rules here:"] + [f"  • {v}" for v in mine]
        if slot in self.locked:
            lines += ["", "🔒 Locked by your edit (kept when re-optimising)."]
        self.details.setPlainText("\n".join(lines))
        s = self.problem.slot_by_index[slot]
        self.room_pick.clear()
        for r in self.problem.rooms_for(s):
            self.room_pick.addItem(f"{r.label} ({r.capacity} seats)", r.id)
        i = self.room_pick.findData(self.assignment[slot].room_id)
        if i >= 0:
            self.room_pick.setCurrentIndex(i)

    def _apply_move(self, slot: int, new: Placement) -> None:
        bad = move_problems(self.problem, self.assignment, slot, new)
        if bad:
            self.move_msg.setText("Not moved: " + "; ".join(v.message for v in bad[:4]))
            QApplication.beep()
            return
        self.assignment = dict(self.assignment)
        self.assignment[slot] = new
        self.locked[slot] = new
        self.reopt_btn.setEnabled(True)
        self.move_msg.setText("")
        self.result = Result("EDITED", self.assignment, soft_score(self.problem, self.assignment, self.settings()), self.result.branches if self.result else 0, 0)
        self.refresh_views()
        self.show_details(slot)
        self.refresh_export()

    def try_move(self, slot: int, day: str, start: int) -> None:
        cur = self.assignment[slot]
        self._apply_move(slot, Placement(day, start, cur.room_id))

    def change_room(self) -> None:
        if self.selected is None or self.room_pick.currentData() is None:
            return
        cur = self.assignment[self.selected]
        self._apply_move(self.selected, Placement(cur.day, cur.start, self.room_pick.currentData()))

    def _unlock(self) -> None:
        self.locked = {}
        self.reopt_btn.setEnabled(False)
        self._draw()

    def reoptimise(self) -> None:
        if self.locked:
            self.generate(fixed=dict(self.locked), hints=dict(self.assignment))

    # ------------------------------------------------------------------ 5 Export
    def _export_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(_label("Export", True, NAVY, 14))
        self.export_state = _label("", True)
        v.addWidget(self.export_state)
        row = QHBoxLayout()
        self.save_btn = QPushButton("Save timetable-solution.xlsx…")
        self.save_btn.clicked.connect(self.save_solution)
        self.pdf_btn = QPushButton("Save PDF (by batch, instructor, room)…")
        self.pdf_btn.clicked.connect(self.save_pdf)
        row.addWidget(self.save_btn)
        row.addWidget(self.pdf_btn)
        row.addStretch()
        v.addLayout(row)
        self.export_violations = QCheckBox("Export with violations (not clash-free — the Summary shows the real count)")
        self.export_violations.setEnabled(False)
        self.export_violations.toggled.connect(self.refresh_export)
        v.addWidget(self.export_violations)
        v.addWidget(_label("Upload the saved file on the portal: Timetable → Upload solution. The portal expects one row per session in the Solution sheet; this file always has them all.", color="#555"))
        self.export_list = QListWidget()
        v.addWidget(self.export_list, 1)
        return w

    def refresh_export(self) -> None:
        if not self.problem or not self.assignment:
            return
        v = self.current_violations()
        self.export_list.clear()
        for line in summarize_violations(v, 30):
            self.export_list.addItem(line)
        if not v:
            self.export_state.setText(f"Checker: 0 hard violations in {len(self.problem.slots)} sessions — ready to export.")
            self.export_state.setStyleSheet(f"color:{GREEN}")
        else:
            self.export_state.setText(f"Checker: {len(v)} hard violation(s). " + ("Exporting anyway (ticked)." if self.export_violations.isChecked() else "Not clash-free, so it can't be exported."))
            self.export_state.setStyleSheet(f"color:{RED}")
        allowed = not v or self.export_violations.isChecked()
        self.save_btn.setEnabled(allowed)
        self.pdf_btn.setEnabled(allowed)
        self.export_violations.setEnabled(bool(v))

    def save_solution(self) -> None:
        v = self.current_violations()  # the checker runs again right before export
        if v and not self.export_violations.isChecked():
            QMessageBox.warning(self, APP, f"The checker found {len(v)} hard violation(s). Not exported.")
            return
        path, _ = QFileDialog.getSaveFileName(self, "Save solution", os.path.join(self.qs.value("dir", ""), "timetable-solution.xlsx"), "Excel files (*.xlsx)")
        if not path:
            return
        score = soft_score(self.problem, self.assignment, self.settings())
        try:
            write_solution(path, self.problem, self.assignment, hard_violations=len(v), branches=self.result.branches if self.result else 0, score=score)
        except PermissionError:
            QMessageBox.warning(self, APP, "Can't save there — is the file open in Excel? Close it and try again.")
            return
        QMessageBox.information(self, APP, f"Saved {os.path.basename(path)}: {len(self.problem.slots)} sessions, {len(v)} hard violation(s).\n\nNow upload it on the portal: Timetable → Upload solution.")

    def save_pdf(self) -> None:
        path, _ = QFileDialog.getSaveFileName(self, "Save PDF", os.path.join(self.qs.value("dir", ""), "timetable.pdf"), "PDF files (*.pdf)")
        if not path:
            return
        try:
            write_pdf(path, self.problem, self.assignment)
        except PermissionError:
            QMessageBox.warning(self, APP, "Can't save there — is the PDF open? Close it and try again.")
            return
        QMessageBox.information(self, APP, f"Saved {os.path.basename(path)}.")

    def closeEvent(self, e):
        if self.worker:
            self.worker.solver.stop()
        if self.thread:
            self.thread.quit()
            self.thread.wait(5000)
        super().closeEvent(e)


def soft_score(p: Problem, a: Assignment, st: Settings) -> float:
    b = soft_breakdown(p, a, st)
    return float(sum(st.weights.get(k, 0) * v for k, v in b.items()))


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName(APP)
    win = MainWindow()
    win.show()
    args = [a for a in sys.argv[1:] if a.lower().endswith(".xlsx")]
    if args and os.path.exists(args[0]):
        win.load(args[0])
    return app.exec()
