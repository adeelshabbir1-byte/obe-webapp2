"""The timetable solver, built on Google OR-Tools CP-SAT.

The solve runs in three steps, each a CP-SAT model:
  A1  Times, hard rules only — finds a clash-free timing fast (or proves there is none).
  A2  Times with the soft rules, starting from A1's timing, until the time limit.
  B   Rooms for those times: best fit, the same room for a section. (If B ever fails, one full model with times and rooms
      together is solved, starting from the timing found.)
Every result then goes through the independent checker before it can be exported.

Times model
  y[i, d, t]  session i starts on day d at half-hour t. Only starts its rules allow exist (allowed day, inside the day's
              hours, teacher available), so rules 2, 3 and 8 hold by construction. Exactly one per session (rule 1).
  Teachers and batches (rules 5, 7): for every half-hour, the sessions running then add up to at most 1. A combined class
              counts for every member batch.
  Rule 9: a section has at most one session a day.
  Rooms in the times model: for every room type and size, the sessions needing that size never outnumber the rooms that
              big at any half-hour (necessary for rule 4/6; step B then assigns the actual rooms).
Rooms model: r[i, k] only for rooms of the right type that hold the class (rule 4); per room and half-hour at most one
  session (rule 6).
Full model (fallback, and the relaxed run that explains an impossible timetable): times and rooms together, rooms as
  optional intervals with AddNoOverlap.

Soft rules (weights editable): compact student days, a section spread over the week, preferred days, no overload (hours
per day, hours in a row), a balanced week, best-fit rooms, fewer late slots, the same room for a section.
"""
from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass, field
from typing import Callable

from ortools.sat.python import cp_model

from .checker import RULES, Violation, check
from .model import HALF_HOURS_PER_DAY as W, Assignment, Placement, Problem, Slot, overlaps
from .precheck import free_starts, precheck

LSum = cp_model.LinearExpr.Sum  # flat sums: Python sum() over thousands of CP-SAT terms is very slow
WSum = cp_model.LinearExpr.WeightedSum

DEFAULT_WEIGHTS = {"compact": 10, "spread": 8, "preferred": 6, "overload": 5, "balance": 3, "bestfit": 2, "late": 2, "stable": 2}
WEIGHT_LABELS = {
    "compact": "Compact days for students (idle gaps)", "spread": "Spread a section's sessions across the week",
    "preferred": "Teachers' preferred days", "overload": "No overload (hours per day, hours in a row)",
    "balance": "Balanced week", "bestfit": "Best-fit rooms (smallest that fits)", "late": "Fewer late slots", "stable": "Same room for a section",
}
HARD = 100_000  # penalty per broken hard rule in the relaxed model


@dataclass
class Settings:
    time_limit: float = 120.0
    workers: int = field(default_factory=lambda: os.cpu_count() or 4)
    weights: dict[str, int] = field(default_factory=lambda: dict(DEFAULT_WEIGHTS))
    max_batch_hours: float = 6.0
    max_teacher_hours: float = 5.0
    max_in_a_row: float = 3.0
    seed: int = 1


@dataclass
class Progress:
    elapsed: float
    objective: float | None
    hard_violations: int | None
    solutions: int
    message: str = ""


@dataclass
class Result:
    status: str  # SOLVED (proved best), FEASIBLE (good, time ran out), STOPPED, INFEASIBLE, NO_SOLUTION, INVALID
    assignment: Assignment | None
    objective: float
    branches: int
    elapsed: float
    violations: list[Violation] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)
    relaxed_assignment: Assignment | None = None  # only when no clash-free timetable was found
    relaxed_violations: list[Violation] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.assignment is not None and not self.violations


def _params(cp: cp_model.CpSolver, st: Settings, limit: float) -> None:
    cp.parameters.max_time_in_seconds = max(1.0, limit)
    cp.parameters.num_workers = max(1, int(st.workers))
    cp.parameters.random_seed = st.seed
    # Lighter presolve: on timetables the deep presolve steps cost far more time than they save.
    cp.parameters.cp_model_probing_level = 0
    cp.parameters.find_big_linear_overlap = False
    cp.parameters.max_presolve_iterations = 1


class _Model:
    """mode: 'times' (step A: no room variables, room-count limits) or 'full' (times and rooms together).
    soft: add the soft rules as the objective. relaxed (full only): hard rules become heavy penalties."""

    def __init__(self, problem: Problem, settings: Settings, fixed: dict[int, Placement] | None, *, mode: str = "times", soft: bool = True, relaxed: bool = False):
        self.p, self.st, self.mode, self.soft, self.relaxed = problem, settings, mode, soft, relaxed
        self.m = cp_model.CpModel()
        self.days = problem.days
        self.di = {d: i for i, d in enumerate(self.days)}
        self.y: dict[int, dict[tuple[str, int], cp_model.IntVar]] = {}
        self.xs: dict[int, dict[str, cp_model.IntVar]] = {}
        self.r: dict[int, dict[str, cp_model.IntVar]] = {}
        self.obj: list = []
        self.hard_terms: list = []
        self.fixed = fixed or {}
        self.w = settings.weights if soft else {}
        m = self.m

        for s in problem.slots:
            opts = self._starts(s, self.fixed.get(s.index))
            self.y[s.index] = {o: m.NewBoolVar(f"y{s.index}_{o[0]}_{o[1]}") for o in opts}
            m.AddExactlyOne(self.y[s.index].values())
            for (d, t), v in self.y[s.index].items():
                if relaxed:
                    broken = (d not in s.allowed_days) + (t < s.day_start or t + s.duration > s.day_end) + self._unavailable(s, d, t)
                    if broken:
                        self.hard_terms.append(HARD * broken * v)
                if self.w.get("late") and t + s.duration > s.day_end - 2:
                    self.obj.append(self.w["late"] * v)
            self.xs[s.index] = {}
            for d in sorted({o[0] for o in opts}, key=self.di.get):
                xv = m.NewBoolVar(f"x{s.index}_{d}")
                m.Add(LSum([v for (dd, _), v in self.y[s.index].items() if dd == d]) == xv)
                self.xs[s.index][d] = xv

        self._people()
        self._sections()
        if mode == "full":
            for s in problem.slots:
                self._room_vars(s)
            self._room_intervals()
        else:
            self._room_counts()
        if soft:
            self._soft_days()
        m.Minimize(LSum(self.obj + self.hard_terms))

    # ------------------------------------------------------------------ starts
    def _unavailable(self, s: Slot, d: str, t: int) -> int:
        return int(any(u.day == d and overlaps(t, t + s.duration, u.start, u.end) for u in self.p.unavailable(s.instructor_id)))

    def _starts(self, s: Slot, fix: Placement | None) -> list[tuple[str, int]]:
        if fix is not None:
            return [(fix.day, int(fix.start))]
        if not self.relaxed:
            return [(d, t) for d, ts in free_starts(self.p, s).items() for t in ts]
        lo = min(s.day_start, min(x.day_start for x in self.p.slots))
        hi = max(s.day_end, max(x.day_end for x in self.p.slots), s.day_start + s.duration)
        return [(d, t) for d in self.days for t in range(lo, hi - s.duration + 1)]

    def week_start(self, s: Slot):
        items = list(self.y[s.index].items())
        return WSum([v for _, v in items], [self.di[d] * W + t for (d, t), _ in items])

    def day_start_var(self, s: Slot) -> cp_model.IntVar:
        """Start time within its day (whatever the day)."""
        items = list(self.y[s.index].items())
        ts = [t for (_, t), _ in items]
        v = self.m.NewIntVar(min(ts), max(ts), f"st{s.index}")
        self.m.Add(v == WSum([x for _, x in items], ts))
        return v

    # ------------------------------------------------------------------ hard rules
    def _people(self) -> None:
        """Teachers and batches: at most one session per half-hour (rules 5, 7); feeds the hours-in-a-row rule."""
        m, st, w = self.m, self.st, self.w
        self.occ: dict[tuple[str, str, int], list] = {}
        self.resources: dict[str, list[Slot]] = {}
        for s in self.p.slots:
            self.resources.setdefault("T:" + s.instructor_id, []).append(s)
            for b in s.batch_ids:
                self.resources.setdefault("B:" + b, []).append(s)
        for key, slots in self.resources.items():
            for s in slots:
                for (d, t), v in self.y[s.index].items():
                    for h in range(t, t + s.duration):
                        self.occ.setdefault((key, d, h), []).append(v)
        for (key, d, h), vs in self.occ.items():
            if len(vs) > 1:
                if self.relaxed:
                    over = m.NewIntVar(0, len(vs), f"over{key}{d}{h}")
                    m.Add(LSum(vs) <= 1 + over)
                    self.hard_terms.append(HARD * over)
                else:
                    m.Add(LSum(vs) <= 1)
        if w.get("overload"):
            run = int(round(st.max_in_a_row * 2)) + 1  # this many busy half-hours in a row = no break after max_in_a_row hours
            for (key, d, h) in list(self.occ):
                window = [(key, d, h + j) for j in range(run)]
                if all(k in self.occ for k in window):
                    e = m.NewBoolVar(f"row{key}{d}{h}")
                    m.Add(LSum([v for k in window for v in self.occ[k]]) <= run - 1 + run * e)
                    self.obj.append(w["overload"] * 2 * e)

    def _sections(self) -> None:
        m, w = self.m, self.w
        for sid, slots in self.p.sections.items():
            if len(slots) < 2:
                continue
            for d in self.days:
                xs = [self.xs[s.index][d] for s in slots if d in self.xs[s.index]]
                if len(xs) > 1:
                    if self.relaxed:
                        v = m.NewIntVar(0, len(xs), f"sameday{sid}{d}")
                        m.Add(LSum(xs) <= 1 + v)
                        self.hard_terms.append(HARD * v)
                    else:
                        m.Add(LSum(xs) <= 1)
            if w.get("spread"):  # neighbouring days (Mon/Tue) cost; Mon/Wed or Tue/Thu don't
                dv = {}
                for s in slots:
                    v = m.NewIntVar(0, len(self.days) - 1, f"day{s.index}")
                    m.Add(v == WSum(list(self.xs[s.index].values()), [self.di[d] for d in self.xs[s.index]]))
                    dv[s.index] = v
                for a in range(len(slots)):
                    for b in range(a + 1, len(slots)):
                        i, j = slots[a].index, slots[b].index
                        diff = m.NewIntVar(-len(self.days), len(self.days), f"dd{i}_{j}")
                        m.Add(diff == dv[i] - dv[j])
                        ad = m.NewIntVar(0, len(self.days), f"ad{i}_{j}")
                        m.AddAbsEquality(ad, diff)
                        near = m.NewBoolVar(f"near{i}_{j}")
                        m.Add(ad >= 2).OnlyEnforceIf(near.Not())
                        self.obj.append(w["spread"] * 2 * near)
        if w.get("preferred"):
            for s in self.p.slots:
                if s.preferred_days:
                    for d, xv in self.xs[s.index].items():
                        if d not in s.preferred_days:
                            self.obj.append(w["preferred"] * 2 * xv)

    def _room_counts(self) -> None:
        """At every half-hour, sessions needing a room of a type and size never outnumber such rooms. Rooms are nested by
        size, so this is checked for every size step of every type."""
        caps: dict[str, list[int]] = {}
        for k in self.p.rooms:
            caps.setdefault(k.type, []).append(k.capacity)
        occ: dict[tuple[str, int, str, int], list] = {}
        for s in self.p.slots:
            sizes = sorted(set(caps.get(s.room_type, [])))
            fit = next((c for c in sizes if c >= s.students), None)
            if fit is None:
                continue
            steps = [c for c in sizes if c <= fit]
            for (d, t), v in self.y[s.index].items():
                for h in range(t, t + s.duration):
                    for c in steps:
                        occ.setdefault((s.room_type, c, d, h), []).append(v)
        for (rt, c, d, h), vs in occ.items():
            n = sum(1 for cap in caps[rt] if cap >= c)
            if len(vs) > n:
                self.m.Add(LSum(vs) <= n)

    def _room_vars(self, s: Slot) -> None:
        m, w = self.m, self.w
        fix = self.fixed.get(s.index)
        if fix is not None and fix.room_id in self.p.room_by_id:
            rooms = [self.p.room_by_id[fix.room_id]]
        elif self.relaxed:
            rooms = sorted(self.p.rooms, key=lambda r: (r.type != s.room_type, r.capacity < s.students, r.capacity))
        else:
            rooms = self.p.rooms_for(s)
        self.r[s.index] = {k.id: m.NewBoolVar(f"r{s.index}_{k.id}") for k in rooms}
        choices = list(self.r[s.index].values())
        if self.relaxed:  # "no free room": the nearest room is used and the clash it causes is reported
            u = m.NewBoolVar(f"noroom{s.index}")
            choices.append(u)
            self.hard_terms.append(HARD * u)
        m.AddExactlyOne(choices)
        rank = {k.id: i for i, k in enumerate(self.p.rooms_for(s))}
        for k in rooms:
            v = self.r[s.index][k.id]
            if self.relaxed and (k.type != s.room_type or k.capacity < s.students):
                self.hard_terms.append(HARD * v)
            elif w.get("bestfit") and rank.get(k.id, 0):
                self.obj.append(w["bestfit"] * min(rank[k.id], 5) * v)

    def _room_intervals(self) -> None:
        m, w = self.m, self.w
        by_room: dict[str, list] = {}
        for s in self.p.slots:
            starts = [self.di[d] * W + t for (d, t) in self.y[s.index]]
            g = m.NewIntVar(min(starts), max(starts), f"g{s.index}")
            m.Add(g == self.week_start(s))
            for kid, v in self.r[s.index].items():
                by_room.setdefault(kid, []).append(m.NewOptionalFixedSizeIntervalVar(g, s.duration, v, f"iv{s.index}_{kid}"))
        for ivs in by_room.values():
            if len(ivs) > 1:
                m.AddNoOverlap(ivs)
        if w.get("stable"):
            _stable_rooms(m, self.p, self.r, w["stable"], self.obj)

    # ------------------------------------------------------------------ soft rules per day
    def _soft_days(self) -> None:
        m, st, w = self.m, self.st, self.w
        starts: dict[int, cp_model.IntVar] = {}
        for key, slots in self.resources.items():
            batch = key.startswith("B:")
            loads = {}
            for d in self.days:
                here = [s for s in slots if d in self.xs[s.index]]
                if not here:
                    continue
                load = WSum([self.xs[s.index][d] for s in here], [s.duration for s in here])
                loads[d] = load
                cap = int(round((st.max_batch_hours if batch else st.max_teacher_hours) * 2))
                most = sum(s.duration for s in here)
                if w.get("overload") and most > cap:
                    ex = m.NewIntVar(0, most, f"ex{key}{d}")
                    m.Add(ex >= load - cap)
                    self.obj.append(w["overload"] * ex)
                if batch and w.get("compact") and len(here) > 1:
                    # idle half-hours = (last end - first start) - hours taught that day
                    first = m.NewIntVar(0, W, f"first{key}{d}")
                    last = m.NewIntVar(0, W, f"last{key}{d}")
                    m.Add(last >= first)
                    for s in here:
                        if s.index not in starts:
                            starts[s.index] = self.day_start_var(s)
                        xv = self.xs[s.index][d]
                        m.Add(first <= starts[s.index]).OnlyEnforceIf(xv)
                        m.Add(last >= starts[s.index] + s.duration).OnlyEnforceIf(xv)
                    self.obj.append(w["compact"] * (last - first - load))
            if w.get("balance") and len(loads) > 1:
                total = sum(s.duration for s in slots)
                hi = m.NewIntVar(0, total, f"hi{key}")
                lo = m.NewIntVar(0, total, f"lo{key}")
                for load in loads.values():
                    m.Add(hi >= load)
                    m.Add(lo <= load)
                self.obj.append(w["balance"] * (hi - lo))

    # ------------------------------------------------------------------ reading a solution
    def times(self, value: Callable) -> dict[int, tuple[str, int]]:
        return {s.index: next(o for o, v in self.y[s.index].items() if value(v)) for s in self.p.slots}

    def extract(self, value: Callable) -> Assignment:
        out: Assignment = {}
        for s in self.p.slots:
            d, t = next(o for o, v in self.y[s.index].items() if value(v))
            room = next((k for k, v in self.r.get(s.index, {}).items() if value(v)), None)
            if room is None:  # relaxed "no free room": the nearest room, so the checker reports the clash it causes
                fit = self.p.rooms_for(s) or sorted(self.p.rooms, key=lambda r: (r.type != s.room_type, -r.capacity))
                room = fit[0].id if fit else ""
            out[s.index] = Placement(d, t, room)
        return out


def _stable_rooms(m: cp_model.CpModel, p: Problem, r: dict[int, dict[str, cp_model.IntVar]], weight: int, obj: list) -> None:
    """Every extra room a section uses costs."""
    for sid, slots in p.sections.items():
        if len(slots) < 2:
            continue
        uses = []
        for k in {k for s in slots for k in r[s.index]}:
            u = m.NewBoolVar(f"use{sid}_{k}")
            for s in slots:
                if k in r[s.index]:
                    m.AddImplication(r[s.index][k], u)
            uses.append(u)
        obj.append(weight * (LSum(uses) - 1))


def _room_model(p: Problem, st: Settings, times: dict[int, tuple[str, int]], fixed: dict[int, Placement]):
    """Step B: rooms for fixed times. Returns (model, r)."""
    m = cp_model.CpModel()
    w = st.weights
    r: dict[int, dict[str, cp_model.IntVar]] = {}
    obj: list = []
    busy: dict[tuple[str, str, int], list] = {}
    for s in p.slots:
        fix = fixed.get(s.index)
        rooms = [p.room_by_id[fix.room_id]] if fix is not None and fix.room_id in p.room_by_id else p.rooms_for(s)
        r[s.index] = {k.id: m.NewBoolVar(f"r{s.index}_{k.id}") for k in rooms}
        m.AddExactlyOne(r[s.index].values())
        d, t = times[s.index]
        for i, k in enumerate(rooms):
            if w.get("bestfit") and i:
                obj.append(w["bestfit"] * min(i, 5) * r[s.index][k.id])
            for h in range(t, t + s.duration):
                busy.setdefault((k.id, d, h), []).append(r[s.index][k.id])
    for vs in busy.values():
        if len(vs) > 1:
            m.AddAtMostOne(vs)
    if w.get("stable"):
        _stable_rooms(m, p, r, w["stable"], obj)
    m.Minimize(LSum(obj))
    return m, r


class _Watcher(cp_model.CpSolverSolutionCallback):
    def __init__(self, model: _Model, on_progress, t0: float, base_obj: float = 0.0, label: str = ""):
        super().__init__()
        self.model, self.on_progress, self.t0, self.base_obj, self.label = model, on_progress, t0, base_obj, label
        self.best_times: dict[int, tuple[str, int]] | None = None
        self.best_full: Assignment | None = None
        self.best_obj: float | None = None
        self.count = 0
        self.lock = threading.Lock()

    def on_solution_callback(self) -> None:
        value = lambda v: self.Value(v)  # noqa: E731
        times = self.model.times(value)
        full = self.model.extract(value) if self.model.mode == "full" else None
        with self.lock:
            self.best_times, self.best_full, self.best_obj = times, full, self.ObjectiveValue()
            self.count += 1
        if self.on_progress:
            self.on_progress(Progress(time.time() - self.t0, self.best_obj + self.base_obj if self.model.soft else None, None if self.model.relaxed else 0, self.count, self.label))


class Solver:
    """Runs one solve. `stop()` from another thread keeps the best timetable found so far."""

    def __init__(self, problem: Problem, settings: Settings | None = None):
        self.problem, self.settings = problem, settings or Settings()
        self._cp: cp_model.CpSolver | None = None
        self._stopped = False
        self.branches = 0

    def stop(self) -> None:
        self._stopped = True
        cp = self._cp
        if cp is not None:
            cp.StopSearch()

    def _solve_model(self, model: _Model, limit: float, on_progress, t0: float, label: str, hints: dict[int, tuple[str, int]] | None = None):
        if hints:
            for s in self.problem.slots:
                h = hints.get(s.index)
                if h is not None:
                    for o, v in model.y[s.index].items():
                        model.m.AddHint(v, int(o == h))
        cp = cp_model.CpSolver()
        _params(cp, self.settings, limit)
        self._cp = cp
        watcher = _Watcher(model, on_progress, t0, label=label)
        status = cp.Solve(model.m, watcher)
        self.branches += cp.NumBranches()
        return status, watcher, cp

    def solve(self, *, fixed: dict[int, Placement] | None = None, hints: Assignment | None = None,
              on_progress: Callable[[Progress], None] | None = None, explain: bool = True) -> Result:
        t0 = time.time()
        p, st = self.problem, self.settings
        fixed = fixed or {}
        left = lambda: st.time_limit - (time.time() - t0)  # noqa: E731
        say = (lambda msg: on_progress(Progress(time.time() - t0, None, None, 0, msg))) if on_progress else (lambda msg: None)
        if fixed:
            bad = _check_fixed(p, fixed)
            if bad:
                return Result("INVALID", None, 0, 0, time.time() - t0, reasons=["Your fixed changes break the rules themselves:"] + [str(v) for v in bad])
        reasons = precheck(p)
        if reasons:
            say("impossible — see the reasons")
            res = Result("INFEASIBLE", None, 0, 0, time.time() - t0, reasons=reasons)
            if explain and not self._stopped:
                self._explain(res, fixed, None, on_progress, max(10.0, min(60.0, st.time_limit / 2)))
            return res

        # A1: a clash-free timing, fast.
        say(f"finding a clash-free timetable ({len(p.slots)} sessions)")
        hint_times = {i: (a.day, int(a.start)) for i, a in (hints or {}).items()}
        a1 = _Model(p, st, fixed, mode="times", soft=False)
        status, w1, _ = self._solve_model(a1, max(5.0, left() * 0.6), on_progress, t0, "clash-free timetable found — now improving it", hint_times or None)
        if w1.best_times is None:
            elapsed = time.time() - t0
            if status == cp_model.INFEASIBLE:
                res = Result("INFEASIBLE", None, 0, self.branches, elapsed, reasons=["No clash-free timetable exists for these sessions, teachers, batches, rooms and times (proved). The relaxed run shows which rules have to give."])
            else:
                res = Result("STOPPED" if self._stopped else "NO_SOLUTION", None, 0, self.branches, elapsed,
                             reasons=["Stopped before a clash-free timetable was found." if self._stopped else f"No clash-free timetable was found in {elapsed:.0f} s. One may still exist: try a longer time limit."])
            if explain and not self._stopped:
                self._explain(res, fixed, hints, on_progress, max(10.0, min(60.0, st.time_limit / 2)))
            return res
        best_times, proved = w1.best_times, False

        # A2: the soft rules, starting from A1's timing.
        reserve = min(15.0, max(4.0, st.time_limit * 0.1))  # kept for the rooms
        if not self._stopped and left() - reserve > 3:
            say("improving the timetable (soft rules)")
            a2 = _Model(p, st, fixed, mode="times", soft=True)
            status2, w2, _ = self._solve_model(a2, left() - reserve, on_progress, t0, "better timetable found", best_times)
            if w2.best_times is not None:
                best_times, proved = w2.best_times, status2 == cp_model.OPTIMAL
        stopped = self._stopped
        self._stopped = False

        # B: rooms for the chosen times (never interrupted by Stop: it is quick and the timetable needs rooms).
        say("assigning rooms")
        assignment, room_obj = self._rooms(best_times, fixed, max(3.0, left()))
        if assignment is None:  # rare: the room counts held but no room plan fits — solve times and rooms together
            say("assigning rooms together with times")
            full = _Model(p, st, fixed, mode="full", soft=True)
            _, wf, _ = self._solve_model(full, max(20.0, left()), on_progress, t0, "timetable with rooms found", best_times)
            assignment, proved = wf.best_full, False
            room_obj = 0.0
            if assignment is None:
                return Result("NO_SOLUTION", None, 0, self.branches, time.time() - t0,
                              reasons=["A clash-free timing was found, but the rooms could not be fitted to it in time. Try a longer time limit."])
        score = _score(p, st, assignment)
        viol = check(p, assignment)  # the independent checker has the last word
        tag = "STOPPED" if stopped else ("SOLVED" if proved else "FEASIBLE")
        if on_progress:
            on_progress(Progress(time.time() - t0, score, len(viol), 0, "done"))
        return Result(tag, assignment, score, self.branches, time.time() - t0, violations=viol)

    def _rooms(self, times: dict[int, tuple[str, int]], fixed, limit: float) -> tuple[Assignment | None, float]:
        m, r = _room_model(self.problem, self.settings, times, fixed)
        cp = cp_model.CpSolver()
        _params(cp, self.settings, min(limit, 30.0))
        status = cp.Solve(m)
        self.branches += cp.NumBranches()
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return None, 0.0
        out: Assignment = {}
        for s in self.problem.slots:
            d, t = times[s.index]
            out[s.index] = Placement(d, t, next(k for k, v in r[s.index].items() if cp.Value(v)))
        return out, cp.ObjectiveValue()

    def _explain(self, res: Result, fixed, hints, on_progress, limit: float) -> None:
        """Re-solve with the hard rules as penalties and report exactly which had to be broken, and where."""
        if on_progress:
            on_progress(Progress(res.elapsed, None, None, 0, "finding which rules have to give"))
        t0 = time.time()
        model = _Model(self.problem, self.settings, fixed, mode="full", soft=False, relaxed=True)
        _, watcher, _ = self._solve_model(model, limit, None, t0, "")
        if watcher.best_full is None:
            return
        res.relaxed_assignment = watcher.best_full
        res.relaxed_violations = check(self.problem, watcher.best_full)
        res.branches = self.branches


def _check_fixed(problem: Problem, fixed: dict[int, Placement]) -> list[Violation]:
    sub = Problem([s for s in problem.slots if s.index in fixed], problem.rooms, problem.unavailability)
    return check(sub, fixed)


def _score(p: Problem, st: Settings, a: Assignment) -> float:
    from .softscore import soft_breakdown
    b = soft_breakdown(p, a, st)
    return float(sum(st.weights.get(k, 0) * v for k, v in b.items()))


def summarize_violations(violations: list[Violation], limit: int = 40) -> list[str]:
    """Groups violations by rule for the report: '3 × No teacher clash' then each case."""
    by_rule: dict[int, list[Violation]] = {}
    for v in violations:
        by_rule.setdefault(v.rule, []).append(v)
    out = []
    for rule in sorted(by_rule):
        vs = by_rule[rule]
        out.append(f"{len(vs)} × {RULES[rule]}")
        out.extend(f"   – {v.message}" for v in vs[:limit])
        if len(vs) > limit:
            out.append(f"   – … and {len(vs) - limit} more")
    return out
