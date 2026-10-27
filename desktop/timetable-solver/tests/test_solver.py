"""Solver tests: a tiny solvable input, impossible inputs with their reasons, the file round trip, and validation."""
import os

from ttsolver.checker import check
from ttsolver.io_xlsx import assignment_from_solution, read_constraints, read_solution, write_solution
from ttsolver.model import Problem, Room, Slot
from ttsolver.precheck import precheck
from ttsolver.sample import tiny_problem, write_constraints
from ttsolver.solver import Settings, Solver


def fast(limit=20):
    return Settings(time_limit=limit, workers=8)


def test_tiny_input_is_solved_with_zero_violations():
    p = tiny_problem()
    res = Solver(p, fast()).solve()
    assert res.ok, res.reasons
    assert check(p, res.assignment) == []
    # rule 9: the two CS101-A sessions are on different days
    assert res.assignment[0].day != res.assignment[1].day
    # rule 8: Khan is away Monday 08:00-10:00
    for i in (0, 1, 4):
        a = res.assignment[i]
        assert not (a.day == "Mon" and a.start < 20)


def test_impossible_teacher_hours_is_reported_in_plain_words():
    days = ["Mon", "Tue"]
    # Dr Khan: 12 one-hour sessions (12 sections) but the window is 2 days × 4 hours = 8 hours.
    slots = [Slot(i, f"S{i}", [f"B{i}"], "K", "THEORY", 2, 20, days, 16, 24, label=f"C{i}", instructor_name="Dr Khan") for i in range(12)]
    p = Problem(slots, [Room(f"R{i}", "THEORY", 40) for i in range(12)], [])
    res = Solver(p, fast(10)).solve()
    assert not res.ok and res.status == "INFEASIBLE"
    assert any("Dr Khan has 12 hours of classes in a window of 8 hours" in r for r in res.reasons), res.reasons
    assert res.assignment is None


def test_no_room_big_enough_is_reported():
    p = Problem([Slot(0, "S", ["B"], "T", "LAB", 2, 60, ["Mon"], 16, 32, label="CS-201 Lab A")], [Room("L1", "LAB", 40)], [])
    assert any("No LAB room holds 60 students for CS-201 Lab A" in r for r in precheck(p))
    assert not Solver(p, fast(5)).solve().ok


def test_infeasible_without_precheck_reason_gets_a_relaxed_report():
    # Three batches share one teacher-free combined slot structure that no single check catches:
    # two sections, each 3 sessions, all for the same batch, only 3 days, 1 hour window per day → 6 hours in 3 hours of time…
    # (precheck catches the batch total) — so build a pure clash: two 2-hour classes of one batch in a 3-hour single day.
    slots = [Slot(0, "S1", ["B"], "T1", "THEORY", 4, 20, ["Mon"], 16, 22, label="X"), Slot(1, "S2", ["B"], "T2", "THEORY", 4, 20, ["Mon"], 16, 22, label="Y")]
    p = Problem(slots, [Room("R", "THEORY", 40), Room("R2", "THEORY", 40)], [])
    res = Solver(p, fast(10)).solve()
    assert not res.ok
    assert res.reasons
    assert res.relaxed_assignment is not None and any(v.rule == 7 for v in res.relaxed_violations)


def test_round_trip_through_the_portal_format(tmp_path):
    p = tiny_problem()
    cfile = os.path.join(tmp_path, "timetable-constraints.xlsx")
    write_constraints(cfile, p, extra_column=True)  # an unknown newer column is ignored
    loaded = read_constraints(cfile)
    assert loaded.errors == [] and loaded.problem is not None
    q = loaded.problem
    res = Solver(q, fast()).solve()
    assert res.ok
    out = os.path.join(tmp_path, "timetable-solution.xlsx")
    write_solution(out, q, res.assignment, hard_violations=0, branches=res.branches, score=res.objective)
    rows, summary = read_solution(out)  # same parsing as app/api/coordinator/timetable/upload-solution/route.ts
    assert len(rows) == len(q.slots)
    assert summary["hardViolations"] == 0
    assert check(q, assignment_from_solution(rows)) == []


def test_validation_lists_every_problem(tmp_path):
    from openpyxl import load_workbook
    p = tiny_problem()
    f = os.path.join(tmp_path, "bad.xlsx")
    write_constraints(f, p)
    wb = load_workbook(f)
    ws = wb["Sections"]
    ws.cell(3, 6).value = None  # DurationHours on row 3
    ws.cell(4, 8).value = "Mon,Funday"
    ws.cell(5, 9).value = 8.25
    wb.save(f)
    res = read_constraints(f)
    assert res.problem is None
    text = "\n".join(res.errors)
    assert "Sections row 3: DurationHours empty" in text
    assert "Sections row 4: AllowedDays has an unknown day 'Funday'" in text
    assert "Sections row 5: DayStartHour 8.25 is not on the half-hour grid" in text


def test_missing_sheet_or_column(tmp_path):
    from openpyxl import Workbook
    f = os.path.join(tmp_path, "x.xlsx")
    wb = Workbook()
    wb.active.title = "Sections"
    wb.active.append(["SlotIndex"])
    wb.save(f)
    errs = read_constraints(f).errors
    assert any("no sheet named Rooms" in e for e in errs)


def test_a_section_over_the_limit_is_reported():
    p = Problem([Slot(0, "S", ["B1#A"], "T", "THEORY", 2, 64, ["Mon", "Tue"], 16, 32, label="CS-201 Section A")], [Room("R1", "THEORY", 80)], [])
    reasons = precheck(p)
    assert any("CS-201 Section A has 64 students — over the 50 limit; regenerate sections on the portal" in r for r in reasons), reasons
    assert not Solver(p, fast(5)).solve().ok
    assert precheck(p, 70) == []  # a higher limit set in Settings


def test_sections_of_one_batch_may_run_together_but_not_one_section_twice():
    from ttsolver.model import Placement
    # Section A and Section B of batch B1 at the same time: allowed (different students).
    p = Problem([Slot(0, "S1", ["B1#A"], "T1", "THEORY", 2, 40, ["Mon"], 16, 32, label="CS-101 Section A"),
                 Slot(1, "S2", ["B1#B"], "T2", "THEORY", 2, 40, ["Mon"], 16, 32, label="CS-101 Section B")], [Room("R1", "THEORY", 50), Room("R2", "THEORY", 50)], [])
    assert check(p, {0: Placement("Mon", 16, "R1"), 1: Placement("Mon", 16, "R2")}) == []
    # Section A in two classes at once (a combined class that also covers B1#A): a clash.
    q = Problem([Slot(0, "S1", ["B1#A"], "T1", "THEORY", 2, 40, ["Mon"], 16, 32, label="CS-101 Section A"),
                 Slot(1, "S3", ["B1#A", "B2#A"], "T2", "THEORY", 2, 50, ["Mon"], 16, 32, label="MA-101 Combined 1")], [Room("R1", "THEORY", 50), Room("R2", "THEORY", 50)], [])
    assert [v.rule for v in check(q, {0: Placement("Mon", 16, "R1"), 1: Placement("Mon", 17, "R2")})] == [7]
