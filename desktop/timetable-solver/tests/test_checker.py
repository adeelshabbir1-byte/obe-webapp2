"""Unit tests: each hard rule of the independent checker."""
from ttsolver.checker import check
from ttsolver.model import Placement, Problem, Room, Slot, Unavailability


def slot(i, sec="S1", batches=("B1",), teacher="T1", rtype="THEORY", dur=2, n=30, days=("Mon", "Tue", "Wed")):
    return Slot(i, sec, list(batches), teacher, rtype, dur, n, list(days), 16, 32, label=f"{sec}#{i}")


ROOMS = [Room("R1", "THEORY", 40), Room("R2", "THEORY", 40), Room("L1", "LAB", 30)]


def rules(problem, a):
    return sorted({v.rule for v in check(problem, a)})


def test_clean_timetable_has_no_violations():
    p = Problem([slot(0), slot(1, sec="S2", teacher="T2", batches=("B2",))], ROOMS, [])
    assert check(p, {0: Placement("Mon", 16, "R1"), 1: Placement("Mon", 16, "R2")}) == []


def test_rule1_every_slot_placed_once():
    p = Problem([slot(0), slot(1, sec="S2")], ROOMS, [])
    assert rules(p, {0: Placement("Mon", 16, "R1")}) == [1]
    assert 1 in rules(p, {0: Placement("Mon", 16, "R1"), 1: Placement("Tue", 16, "R1"), 7: Placement("Mon", 20, "R1")})


def test_rule2_allowed_days():
    p = Problem([slot(0)], ROOMS, [])
    assert rules(p, {0: Placement("Fri", 16, "R1")}) == [2]


def test_rule3_hours_and_grid():
    p = Problem([slot(0)], ROOMS, [])
    assert rules(p, {0: Placement("Mon", 15, "R1")}) == [3]  # 07:30, before 08:00
    assert rules(p, {0: Placement("Mon", 31, "R1")}) == [3]  # ends 16:30, after 16:00
    assert rules(p, {0: Placement("Mon", 16.5, "R1")}) == [3]  # 08:15 is off the half-hour grid


def test_rule4_room_type_and_capacity():
    p = Problem([slot(0, n=35)], ROOMS, [])
    assert rules(p, {0: Placement("Mon", 16, "L1")}) == [4]  # a lab for a theory class, and too small
    p2 = Problem([slot(0, n=45)], ROOMS, [])
    assert rules(p2, {0: Placement("Mon", 16, "R1")}) == [4]
    assert rules(p2, {0: Placement("Mon", 16, "NOPE")}) == [4]


def test_rule5_instructor_clash():
    p = Problem([slot(0, sec="S1", batches=("B1",)), slot(1, sec="S2", batches=("B2",))], ROOMS, [])
    assert rules(p, {0: Placement("Mon", 16, "R1"), 1: Placement("Mon", 17, "R2")}) == [5]
    assert rules(p, {0: Placement("Mon", 16, "R1"), 1: Placement("Mon", 18, "R2")}) == []  # back to back is fine


def test_rule6_room_clash():
    p = Problem([slot(0, sec="S1", teacher="T1", batches=("B1",)), slot(1, sec="S2", teacher="T2", batches=("B2",))], ROOMS, [])
    assert rules(p, {0: Placement("Tue", 16, "R1"), 1: Placement("Tue", 17, "R1")}) == [6]


def test_rule7_student_clash_includes_combined_groups():
    p = Problem([slot(0, sec="S1", teacher="T1", batches=("B1", "B2")), slot(1, sec="S2", teacher="T2", batches=("B2",))], ROOMS, [])
    assert rules(p, {0: Placement("Mon", 16, "R1"), 1: Placement("Mon", 16, "R2")}) == [7]


def test_rule8_unavailability():
    p = Problem([slot(0)], ROOMS, [Unavailability("T1", "Mon", 26, 28)])
    assert rules(p, {0: Placement("Mon", 25, "R1")}) == [8]
    assert rules(p, {0: Placement("Mon", 24, "R1")}) == []  # ends exactly when the break starts


def test_rule9_section_sessions_on_different_days():
    p = Problem([slot(0, sec="S1"), slot(1, sec="S1")], ROOMS, [])
    assert rules(p, {0: Placement("Wed", 16, "R1"), 1: Placement("Wed", 24, "R1")}) == [9]  # same day, no overlap: still broken
    assert rules(p, {0: Placement("Wed", 16, "R1"), 1: Placement("Tue", 16, "R1")}) == []
