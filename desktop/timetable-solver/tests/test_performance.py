"""Performance target: 600 slots, 40 rooms and 80 instructors solved clash-free within 120 s."""
import time

from ttsolver.checker import check
from ttsolver.sample import generated_problem
from ttsolver.solver import Settings, Solver


def test_600_slots_clash_free_within_120_seconds():
    p = generated_problem(n_slots=600, n_rooms=40, n_teachers=80)
    assert len(p.slots) == 600 and len(p.rooms) == 40 and len(p.instructors) == 80
    t0 = time.time()
    res = Solver(p, Settings(time_limit=100)).solve()
    took = time.time() - t0
    assert res.assignment is not None, res.reasons
    assert check(p, res.assignment) == []
    assert took <= 120, f"took {took:.0f} s"
    print(f"\n600 slots: {res.status}, score {res.objective:.0f}, {took:.0f} s, {res.branches} branches")
