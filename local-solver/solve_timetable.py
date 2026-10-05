"""
Local Timetable Solver
======================

Reads the "timetable-constraints.xlsx" file downloaded from the portal
(Timetable -> Generate & View -> Option A -> "1. Download Constraints"),
finds a clash-free timetable with Google OR-Tools' CP-SAT constraint solver,
and writes "timetable-solution.xlsx" in exactly the format the portal's
"Upload Solution" button already accepts.

It runs entirely on your own computer: no web time limit, no server.

Hard rules (a class is only ever placed where ALL of these hold):
  * an instructor teaches one class at a time
  * a room hosts one class at a time
  * a batch attends one class at a time (a combined/clubbed class blocks
    every batch it covers)
  * inside the batch's allowed days and daily start/end hours
  * not during the instructor's blocked (unavailable) times
  * in a room of the right type with enough seats

If the rooms/hours simply cannot hold everything, the solver places as much
as it possibly can, then puts each leftover class in its least-bad slot and
reports exactly which ones clash, so you know what to fix (add a room,
widen hours, ...). It never fails with "no solution".

Soft preferences (it tries, but will give way if it must):
  * keep a section's weekly sessions on different days
  * an instructor teaches at most N hours a day (default 6)
  * earlier in the day rather than later
  * only use a lab room for a theory class when lecture rooms are full
    (optional - see allow_theory_in_labs)
"""
from __future__ import annotations

import argparse
import os
import sys
import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Tuple

import openpyxl
from ortools.sat.python import cp_model

UNIT = 0.5            # the timetable grid is half-hours, same as the portal
DAY_UNITS = 48        # 24h / 0.5h - keeps different days from ever overlapping
DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


# --------------------------------------------------------------------------
# Data
# --------------------------------------------------------------------------
@dataclass
class Slot:
    index: int                  # SlotIndex - the key the portal matches on
    section_id: str
    batch_ids: List[str]
    instructor_id: str
    room_type: str              # "LECTURE" | "LAB"
    duration_h: float
    students: int
    allowed_days: List[str]
    day_start_h: float
    day_end_h: float
    label: str = ""             # readable name, if the portal supplied one
    instructor_name: str = ""
    batch_label: str = ""

    @property
    def dur_u(self) -> int:
        return max(1, int(round(self.duration_h / UNIT)))

    def name(self) -> str:
        base = self.label or f"slot {self.index}"
        extra = " / ".join(x for x in (self.instructor_name, self.batch_label) if x)
        return f"{base} ({extra})" if extra else base


@dataclass
class Room:
    id: str
    type: str
    capacity: int
    name: str = ""

    def title(self) -> str:
        return self.name or self.id


@dataclass
class Unavail:
    faculty_id: str
    day: str
    start_h: float
    end_h: float


@dataclass
class SolveResult:
    # slot index -> (day, start_hour, room_id)
    assignment: Dict[int, Tuple[str, float, str]] = field(default_factory=dict)
    placed_by_solver: int = 0
    total_slots: int = 0
    leftover: List[Tuple[Slot, str]] = field(default_factory=list)   # (slot, why)
    violations: Dict[str, int] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)
    capacity_notes: List[str] = field(default_factory=list)
    solutions_found: int = 0
    seconds: float = 0.0
    status: str = ""

    @property
    def hard_violations(self) -> int:
        return sum(self.violations.values())


# --------------------------------------------------------------------------
# Reading the portal's constraints file
# --------------------------------------------------------------------------
def _header_map(ws) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for c in ws[1]:
        if c.value is not None:
            out[str(c.value).strip().lower()] = c.column
    return out


def _cell(ws, row: int, cols: Dict[str, int], name: str, default=None):
    col = cols.get(name.lower())
    if col is None:
        return default
    v = ws.cell(row=row, column=col).value
    return default if v is None else v


def read_constraints(path: str) -> Tuple[List[Slot], List[Room], List[Unavail]]:
    wb = openpyxl.load_workbook(path, data_only=True)
    for needed in ("Sections", "Rooms"):
        if needed not in wb.sheetnames:
            raise ValueError(
                f'This file has no "{needed}" sheet. Please use the file you '
                f'downloaded from the portal ("Download Constraints (Excel)").')

    ws = wb["Sections"]
    cols = _header_map(ws)
    slots: List[Slot] = []
    for r in range(2, ws.max_row + 1):
        idx = _cell(ws, r, cols, "SlotIndex")
        if idx is None or str(idx).strip() == "":
            continue
        days = [d.strip() for d in str(_cell(ws, r, cols, "AllowedDays", "Mon,Tue,Wed,Thu,Fri")).split(",") if d.strip()]
        slots.append(Slot(
            index=int(float(idx)),
            section_id=str(_cell(ws, r, cols, "ScheduleSectionId", "")),
            batch_ids=[b.strip() for b in str(_cell(ws, r, cols, "BatchId", "")).split(",") if b.strip()],
            instructor_id=str(_cell(ws, r, cols, "InstructorId", "")),
            room_type=str(_cell(ws, r, cols, "RoomTypeNeeded", "LECTURE")).strip().upper(),
            duration_h=float(_cell(ws, r, cols, "DurationHours", 1.5)),
            students=int(float(_cell(ws, r, cols, "StudentCount", 0) or 0)),
            allowed_days=[d for d in days if d in DAY_ORDER] or ["Mon", "Tue", "Wed", "Thu", "Fri"],
            day_start_h=float(_cell(ws, r, cols, "DayStartHour", 8)),
            day_end_h=float(_cell(ws, r, cols, "DayEndHour", 16)),
            label=str(_cell(ws, r, cols, "Label", "") or ""),
            instructor_name=str(_cell(ws, r, cols, "InstructorName", "") or ""),
            batch_label=str(_cell(ws, r, cols, "BatchLabels", "") or ""),
        ))
    slots.sort(key=lambda s: s.index)

    ws = wb["Rooms"]
    cols = _header_map(ws)
    rooms: List[Room] = []
    for r in range(2, ws.max_row + 1):
        rid = _cell(ws, r, cols, "RoomId")
        if rid is None or str(rid).strip() == "":
            continue
        rooms.append(Room(
            id=str(rid), type=str(_cell(ws, r, cols, "Type", "LECTURE")).strip().upper(),
            capacity=int(float(_cell(ws, r, cols, "Capacity", 0) or 0)),
            name=str(_cell(ws, r, cols, "RoomName", "") or ""),
        ))

    unavail: List[Unavail] = []
    if "Unavailability" in wb.sheetnames:
        ws = wb["Unavailability"]
        cols = _header_map(ws)
        for r in range(2, ws.max_row + 1):
            fid = _cell(ws, r, cols, "FacultyId")
            if fid is None or str(fid).strip() == "":
                continue
            unavail.append(Unavail(
                faculty_id=str(fid), day=str(_cell(ws, r, cols, "DayOfWeek", "")).strip(),
                start_h=float(_cell(ws, r, cols, "StartHour", 0)), end_h=float(_cell(ws, r, cols, "EndHour", 0))))
    return slots, rooms, unavail


# --------------------------------------------------------------------------
# Helpers shared by the solver and the independent checker
# --------------------------------------------------------------------------
def _overlap(a0: float, a1: float, b0: float, b1: float) -> bool:
    return a0 < b1 and b0 < a1


def _to_u(h: float) -> int:
    return int(round(h / UNIT))


def candidate_rooms(slot: Slot, rooms: List[Room], allow_theory_in_labs: bool) -> List[Tuple[Room, int, str]]:
    """Rooms a slot may use, as (room, cost, note). Best tier that is
    non-empty wins; lower tiers only exist so that a bad setup still
    produces a best-effort timetable instead of nothing."""
    right = [r for r in rooms if r.type == slot.room_type]
    ok = [(r, 0, "") for r in right if r.capacity >= slot.students]
    if allow_theory_in_labs and slot.room_type == "LECTURE":
        ok += [(r, 30 * slot.dur_u, "overflow") for r in rooms
               if r.type == "LAB" and r.capacity >= slot.students]
    if ok:
        return ok
    if right:      # right type, but nothing big enough - allow with a heavy cost
        return [(r, 400, "too-small") for r in right]
    return [(r, 800, "wrong-type") for r in rooms]


def count_violations(slots: List[Slot], rooms: List[Room], unavail: List[Unavail],
                     assign: Dict[int, Tuple[str, float, str]], allow_theory_in_labs: bool) -> Dict[str, int]:
    """Independent check of a finished timetable, counted the same way the
    portal's own generator counts clashes (one per clashing pair/rule)."""
    room_by = {r.id: r for r in rooms}
    v: Dict[str, int] = defaultdict(int)
    by_day: Dict[str, List[Tuple[Slot, float, float, str]]] = defaultdict(list)
    for s in slots:
        if s.index not in assign:
            v["not placed"] += 1
            continue
        day, start, rid = assign[s.index]
        end = start + s.duration_h
        room = room_by.get(rid)
        if day not in s.allowed_days:
            v["outside allowed days"] += 1
        if start < s.day_start_h - 1e-9 or end > s.day_end_h + 1e-9:
            v["outside daily hours"] += 1
        if room is None:
            v["unknown room"] += 1
        else:
            type_ok = room.type == s.room_type or (allow_theory_in_labs and s.room_type == "LECTURE" and room.type == "LAB")
            if not type_ok:
                v["wrong room type"] += 1
            if room.capacity < s.students:
                v["room too small"] += 1
        for u in unavail:
            if u.faculty_id == s.instructor_id and u.day == day and _overlap(start, end, u.start_h, u.end_h):
                v["instructor unavailable"] += 1
        by_day[day].append((s, start, end, rid))
    for day, items in by_day.items():
        for i in range(len(items)):
            a, a0, a1, ar = items[i]
            for j in range(i + 1, len(items)):
                b, b0, b1, br = items[j]
                if not _overlap(a0, a1, b0, b1):
                    continue
                if a.instructor_id == b.instructor_id:
                    v["instructor double-booked"] += 1
                if ar == br:
                    v["room double-booked"] += 1
                if set(a.batch_ids) & set(b.batch_ids):
                    v["batch double-booked"] += 1
    return {k: n for k, n in v.items() if n}


def capacity_analysis(slots: List[Slot], rooms: List[Room], allow_theory_in_labs: bool) -> List[str]:
    """Plain-language room-hours check, printed before solving."""
    if not slots:
        return []
    days = set()
    lo, hi = 24.0, 0.0
    for s in slots:
        days.update(s.allowed_days)
        lo, hi = min(lo, s.day_start_h), max(hi, s.day_end_h)
    per_room = len(days) * max(0.0, hi - lo)
    need = {"LECTURE": 0.0, "LAB": 0.0}
    for s in slots:
        need[s.room_type] = need.get(s.room_type, 0.0) + s.duration_h
    n_lec = sum(1 for r in rooms if r.type == "LECTURE")
    n_lab = sum(1 for r in rooms if r.type == "LAB")
    have_lec, have_lab = n_lec * per_room, n_lab * per_room
    notes = [
        f"Teaching week: {len(days)} day(s), {lo:g}:00-{hi:g}:00 = {per_room:g} room-hours per room.",
        f"Lecture rooms: {need['LECTURE']:g} room-hours needed vs {have_lec:g} available ({n_lec} rooms).",
        f"Lab rooms:     {need['LAB']:g} room-hours needed vs {have_lab:g} available ({n_lab} rooms).",
    ]
    if need["LECTURE"] > have_lec:
        short = need["LECTURE"] - have_lec
        spare_lab = max(0.0, have_lab - need["LAB"])
        if allow_theory_in_labs and spare_lab >= short:
            notes.append(f"Lecture rooms are short by {short:g} room-hours, but spare lab time ({spare_lab:g}) can absorb it.")
        elif allow_theory_in_labs:
            notes.append(f"WARNING: even using spare lab time ({spare_lab:g}), lecture demand exceeds supply by {short - spare_lab:g} room-hours - some classes cannot be placed.")
        else:
            notes.append(f"WARNING: lecture demand exceeds lecture-room supply by {short:g} room-hours - some classes cannot be placed (try allowing theory in labs, adding rooms, or widening hours).")
    if need["LAB"] > have_lab:
        notes.append(f"WARNING: lab demand exceeds lab-room supply by {need['LAB'] - have_lab:g} room-hours.")
    return notes



# --------------------------------------------------------------------------
# A fast greedy first draft - used as a starting point ("hint") for the
# solver, so it begins from a mostly-working timetable instead of from
# nothing, and then improves on it.
# --------------------------------------------------------------------------
def greedy_construct(slots: List[Slot], rooms: List[Room], unavail: List[Unavail],
                     allow_theory_in_labs: bool) -> Dict[int, Tuple[str, int, str]]:
    """Returns {slot index: (day, start_unit, room_id)} for every class it
    could place with NO clash. Hardest classes first."""
    blocked: Dict[Tuple[str, str], List[Tuple[int, int]]] = defaultdict(list)
    for u in unavail:
        blocked[(u.faculty_id, u.day)].append((_to_u(u.start_h), _to_u(u.end_h)))
    instr_load: Dict[str, int] = defaultdict(int)
    batch_load: Dict[str, int] = defaultdict(int)
    n_by_instr: Dict[str, int] = defaultdict(int)
    for sl in slots:
        n_by_instr[sl.instructor_id] += sl.dur_u
    # busy intervals: key -> list of (start_u, end_u)
    busy_i: Dict[Tuple[str, str], List[Tuple[int, int]]] = defaultdict(list)
    busy_b: Dict[Tuple[str, str], List[Tuple[int, int]]] = defaultdict(list)
    busy_r: Dict[Tuple[str, str], List[Tuple[int, int]]] = defaultdict(list)
    sec_days: Dict[str, set] = defaultdict(set)
    cand = {sl.index: candidate_rooms(sl, rooms, allow_theory_in_labs) for sl in slots}

    def hard(sl: Slot):
        return (-(len(sl.batch_ids) > 1), -sl.dur_u, -n_by_instr[sl.instructor_id], len(cand[sl.index]), sl.index)

    def free(lst, a, b):
        return all(not (a < e and s_ < b) for s_, e in lst)

    out: Dict[int, Tuple[str, int, str]] = {}
    for sl in sorted(slots, key=hard):
        lo, hi = _to_u(sl.day_start_h), _to_u(sl.day_end_h)
        best = None
        for day in sl.allowed_days:
            same_day = 1 if day in sec_days[sl.section_id] else 0
            for u0 in range(lo, hi - sl.dur_u + 1):
                a, b_ = u0, u0 + sl.dur_u
                if any(a < e and bs < b_ for bs, e in blocked.get((sl.instructor_id, day), [])):
                    continue
                if not free(busy_i[(sl.instructor_id, day)], a, b_):
                    continue
                if any(not free(busy_b[(bid, day)], a, b_) for bid in sl.batch_ids):
                    continue
                for r, cost, _note in cand[sl.index]:
                    if cost >= 400 or not free(busy_r[(r.id, day)], a, b_):
                        continue
                    score = (same_day * 5000 + cost * 3 + (u0 - lo) * 2
                             + 40 * sum(batch_load[(bid, day)] for bid in sl.batch_ids) // max(1, len(sl.batch_ids))
                             + 25 * instr_load[(sl.instructor_id, day)])
                    if best is None or score < best[0]:
                        best = (score, day, u0, r.id)
                    break          # first free room of the cheapest tier is enough for this time
        if best is None:
            continue
        _, day, u0, rid = best
        a, b_ = u0, u0 + sl.dur_u
        out[sl.index] = (day, u0, rid)
        busy_i[(sl.instructor_id, day)].append((a, b_))
        busy_r[(rid, day)].append((a, b_))
        for bid in sl.batch_ids:
            busy_b[(bid, day)].append((a, b_))
            batch_load[(bid, day)] += sl.dur_u
        instr_load[(sl.instructor_id, day)] += sl.dur_u
        sec_days[sl.section_id].add(day)
    return out

# --------------------------------------------------------------------------
# The solver
# --------------------------------------------------------------------------
def _soft_score(slots: List[Slot], rooms: List[Room], assign: Dict[int, Tuple[str, int, str]],
                allow_theory_in_labs: bool, cap_u: int) -> int:
    """How good a (clash-free part of a) timetable is. Higher is better.
    Placed class-hours dominate; everything else is tidiness."""
    score = 0
    by_sec: Dict[Tuple[str, str], int] = defaultdict(int)
    load: Dict[Tuple[str, str], int] = defaultdict(int)
    for s in slots:
        if s.index not in assign:
            continue
        day, u0, rid = assign[s.index]
        score += 10000 * s.dur_u
        for r, cost, _ in candidate_rooms(s, rooms, allow_theory_in_labs):
            if r.id == rid:
                score -= cost
                break
        score -= max(0, u0 - _to_u(s.day_start_h))
        by_sec[(s.section_id, day)] += 1
        load[(s.instructor_id, day)] += s.dur_u
    score -= 60 * sum(n - 1 for n in by_sec.values() if n > 1)
    score -= 15 * sum(max(0, n - cap_u) for n in load.values())
    return score


def _solve_subproblem(free: List[Slot], fixed: Dict[int, Tuple[Slot, str, int, str]], slots_by_index, rooms: List[Room],
                      unavail: List[Unavail], hint: Dict[int, Tuple[str, int, str]], allow_theory_in_labs: bool,
                      cap_u: int, time_s: float, workers: int, seed: int) -> Optional[Dict[int, Tuple[str, int, str]]]:
    """Re-plan only the `free` classes; every class in `fixed` stays exactly
    where it is and just occupies its instructor / batch(es) / room."""
    model = cp_model.CpModel()
    blocked: Dict[Tuple[str, int], List[Tuple[int, int]]] = defaultdict(list)
    for u in unavail:
        if u.day in DAY_ORDER:
            blocked[(u.faculty_id, DAY_ORDER.index(u.day))].append((_to_u(u.start_h), _to_u(u.end_h)))

    # what the fixed classes already occupy
    occ_i: Dict[Tuple[str, int], List[Tuple[int, int]]] = defaultdict(list)
    occ_b: Dict[Tuple[str, int], List[Tuple[int, int]]] = defaultdict(list)
    grp_i: Dict[str, list] = defaultdict(list)
    grp_b: Dict[str, list] = defaultdict(list)
    grp_r: Dict[str, list] = defaultdict(list)
    sec_fixed_days: Dict[Tuple[str, int], int] = defaultdict(int)
    load_fixed: Dict[Tuple[str, int], int] = defaultdict(int)
    for idx, (sl, day, u0, rid) in fixed.items():
        d = DAY_ORDER.index(day)
        a = d * DAY_UNITS + u0
        occ_i[(sl.instructor_id, d)].append((u0, u0 + sl.dur_u))
        for b in sl.batch_ids:
            occ_b[(b, d)].append((u0, u0 + sl.dur_u))
        fi = model.NewFixedSizeIntervalVar(a, sl.dur_u, f"f{idx}")
        grp_i[sl.instructor_id].append(fi)
        for b in sl.batch_ids:
            grp_b[b].append(fi)
        grp_r[rid].append(fi)
        sec_fixed_days[(sl.section_id, d)] += 1
        load_fixed[(sl.instructor_id, d)] += sl.dur_u

    y: Dict[int, Dict[Tuple[int, int], cp_model.IntVar]] = {}
    placed: Dict[int, cp_model.IntVar] = {}
    start_var: Dict[int, cp_model.IntVar] = {}
    zmap: Dict[int, List[Tuple[Room, cp_model.IntVar]]] = {}
    pen: List[Tuple[object, int]] = []
    for s in free:
        opts: Dict[Tuple[int, int], cp_model.IntVar] = {}
        lo_u, hi_u = _to_u(s.day_start_h), _to_u(s.day_end_h)
        for dname in s.allowed_days:
            d = DAY_ORDER.index(dname)
            for u0 in range(lo_u, hi_u - s.dur_u + 1):
                e0 = u0 + s.dur_u
                if any(u0 < b1 and b0 < e0 for b0, b1 in blocked.get((s.instructor_id, d), [])):
                    continue
                if any(u0 < b1 and b0 < e0 for b0, b1 in occ_i.get((s.instructor_id, d), [])):
                    continue
                if any(u0 < b1 and b0 < e0 for bid in s.batch_ids for b0, b1 in occ_b.get((bid, d), [])):
                    continue
                opts[(d, u0)] = model.NewBoolVar(f"y{s.index}_{d}_{u0}")
        y[s.index] = opts
        p = model.NewBoolVar(f"p{s.index}")
        placed[s.index] = p
        sv = model.NewIntVar(0, 7 * DAY_UNITS, f"st{s.index}")
        start_var[s.index] = sv
        if not opts:
            model.Add(p == 0)
            model.Add(sv == 0)
        else:
            model.Add(sum(opts.values()) == p)
            model.Add(sv == sum(v * (d * DAY_UNITS + u0) for (d, u0), v in opts.items()))
        cands = candidate_rooms(s, rooms, allow_theory_in_labs)
        zmap[s.index] = []
        for r, cost, _ in cands:
            z = model.NewBoolVar(f"z{s.index}_{r.id}")
            zmap[s.index].append((r, z))
            if cost:
                pen.append((z, cost))
        model.Add(sum(z for _, z in zmap[s.index]) == p)

    # intervals for the free classes
    fiv: Dict[int, object] = {}
    for s in free:
        fiv[s.index] = model.NewOptionalIntervalVar(start_var[s.index], s.dur_u, start_var[s.index] + s.dur_u, placed[s.index], f"iv{s.index}")
        grp_i[s.instructor_id].append(fiv[s.index])
        for b in s.batch_ids:
            grp_b[b].append(fiv[s.index])
        for r, z in zmap[s.index]:
            grp_r[r.id].append(model.NewOptionalIntervalVar(start_var[s.index], s.dur_u, start_var[s.index] + s.dur_u, z, f"r{s.index}_{r.id}"))
    for g in list(grp_i.values()) + list(grp_b.values()) + list(grp_r.values()):
        if len(g) > 1:
            model.AddNoOverlap(g)

    # tidiness (soft) - counts the fixed classes as constants
    def day_expr(s, d):
        return sum(v for (dd, _), v in y[s.index].items() if dd == d)
    secs: Dict[str, List[Slot]] = defaultdict(list)
    ins: Dict[str, List[Slot]] = defaultdict(list)
    for s in free:
        secs[s.section_id].append(s)
        ins[s.instructor_id].append(s)
    for sec, grp in secs.items():
        for d in range(7):
            fixed_n = sec_fixed_days.get((sec, d), 0)
            terms = [day_expr(s, d) for s in grp if any(dd == d for dd, _ in y[s.index])]
            if terms and (len(terms) + fixed_n) > 1:
                ex = model.NewIntVar(0, len(terms) + fixed_n, f"sd{sec}_{d}")
                model.Add(ex >= sum(terms) + fixed_n - 1)
                pen.append((ex, 60))
    for iid, grp in ins.items():
        for d in range(7):
            fixed_l = load_fixed.get((iid, d), 0)
            terms = [s.dur_u * day_expr(s, d) for s in grp if any(dd == d for dd, _ in y[s.index])]
            if terms and fixed_l + sum(s.dur_u for s in grp) > cap_u:
                ex = model.NewIntVar(0, DAY_UNITS, f"ld{iid}_{d}")
                model.Add(ex >= sum(terms) + fixed_l - cap_u)
                pen.append((ex, 15))
    for s in free:
        base = _to_u(s.day_start_h)
        for (d, u0), v in y[s.index].items():
            if u0 > base:
                pen.append((v, u0 - base))

    model.Maximize(sum(placed[s.index] * (10000 * s.dur_u) for s in free) - sum(v * w for v, w in pen))

    # start from what we already have for these classes
    for s in free:
        h = hint.get(s.index)
        for (d, u0), v in y[s.index].items():
            model.AddHint(v, 1 if h and h[0] == DAY_ORDER[d] and h[1] == u0 else 0)
        model.AddHint(placed[s.index], 1 if h else 0)
        for r, z in zmap[s.index]:
            model.AddHint(z, 1 if h and h[2] == r.id else 0)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_s)
    solver.parameters.num_workers = max(1, workers)
    solver.parameters.random_seed = seed
    solver.parameters.repair_hint = True
    solver.parameters.log_search_progress = bool(os.environ.get("SOLVER_DEBUG"))
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None
    out: Dict[int, Tuple[str, int, str]] = {}
    for s in free:
        if solver.Value(placed[s.index]):
            (d, u0) = next(k for k, v in y[s.index].items() if solver.Value(v))
            room = next(r for r, z in zmap[s.index] if solver.Value(z))
            out[s.index] = (DAY_ORDER[d], u0, room.id)
    return out


def solve(slots: List[Slot], rooms: List[Room], unavail: List[Unavail], *,
          time_limit_s: float = 180.0, allow_theory_in_labs: bool = True,
          instructor_max_hours_per_day: float = 6.0, patience_s: float = 45.0,
          log: Callable[[str], None] = print, stop_event: Optional[threading.Event] = None,
          workers: Optional[int] = None, seed: int = 7) -> SolveResult:
    import random
    rnd = random.Random(seed)
    t0 = time.time()
    res = SolveResult(total_slots=len(slots))
    if not slots:
        res.status = "nothing to schedule"
        return res
    if not rooms:
        raise ValueError("There are no rooms in the file - add rooms in the portal first.")
    workers = workers or max(1, os.cpu_count() or 1)
    cap_u = _to_u(instructor_max_hours_per_day)
    by_index = {s.index: s for s in slots}

    res.capacity_notes = capacity_analysis(slots, rooms, allow_theory_in_labs)
    for n in res.capacity_notes:
        log(n)
    warn: Dict[str, int] = {}
    for s in slots:
        for r, cost, note in candidate_rooms(s, rooms, allow_theory_in_labs)[:1]:
            if note == "too-small":
                warn["no room is large enough for " + s.name()] = 1
            elif note == "wrong-type":
                warn[f"no {s.room_type.lower()} room exists for " + s.name()] = 1
    res.warnings = sorted(warn)

    # 1) quick first draft
    current = greedy_construct(slots, rooms, unavail, allow_theory_in_labs)
    log(f"Quick first draft: {len(current)}/{len(slots)} classes placed with no clash.")
    best_score = _soft_score(slots, rooms, {i: v for i, v in ((i, (d, u, r)) for i, (d, u, r) in current.items())}, allow_theory_in_labs, cap_u)

    # 2) improve it: re-plan a small group of classes at a time (the ones still
    #    unplaced + whatever is in their way), everything else held still.
    deadline = t0 + time_limit_s
    last_gain = time.time()
    all_placed_at: Optional[float] = None
    rounds = 0
    stop_reason = "time limit"
    FREE_CAP = 70
    while True:
        now = time.time()
        if stop_event is not None and stop_event.is_set():
            stop_reason = "stopped by you"
            break
        if now >= deadline:
            break
        if len(current) == len(slots):
            all_placed_at = all_placed_at or now
            if now - last_gain > patience_s:
                stop_reason = "no further improvement"
                break
        unplaced = [s for s in slots if s.index not in current]
        placed_list = [s for s in slots if s.index in current]
        if len(slots) <= FREE_CAP + 20:
            free = list(slots)
        elif not unplaced:
            # everything fits - now tidy: revisit the classes that bent a soft preference
            # (a theory class sitting in a lab room, sessions of one section on the same
            # day, a late start) plus a random handful so new arrangements can open up
            room_type = {r.id: r.type for r in rooms}
            sec_days_seen: Dict[Tuple[str, str], int] = defaultdict(int)
            for s in placed_list:
                sec_days_seen[(s.section_id, current[s.index][0])] += 1
            weak = [s for s in placed_list
                    if room_type.get(current[s.index][2]) != s.room_type
                    or sec_days_seen[(s.section_id, current[s.index][0])] > 1]
            rnd.shuffle(weak)
            free = weak[:40]
            chosen = {s.index for s in free}
            rest = [o for o in placed_list if o.index not in chosen]
            rnd.shuffle(rest)
            free += rest[: max(0, FREE_CAP - len(free))]
        else:
            free = []
            chosen = set()
            for s in rnd.sample(unplaced, min(len(unplaced), 14)):
                free.append(s); chosen.add(s.index)
                # whoever shares this class's instructor or batch is "in its way"
                blockers = [o for o in placed_list if o.index not in chosen and
                            (o.instructor_id == s.instructor_id or set(o.batch_ids) & set(s.batch_ids))]
                for o in rnd.sample(blockers, min(len(blockers), 5)):
                    free.append(o); chosen.add(o.index)
                # when rooms are the bottleneck, classes using the same kind of room are in its way too
                same_kind = [o for o in placed_list if o.index not in chosen and o.room_type == s.room_type]
                for o in rnd.sample(same_kind, min(len(same_kind), 3)):
                    free.append(o); chosen.add(o.index)
            rest = [o for o in placed_list if o.index not in chosen]
            rnd.shuffle(rest)
            for o in rest[: max(0, FREE_CAP - len(free))]:
                free.append(o); chosen.add(o.index)
        free_ids = {s.index for s in free}
        fixed = {i: (by_index[i], d, u, r) for i, (d, u, r) in current.items() if i not in free_ids}
        hint = {i: v for i, v in current.items() if i in free_ids}
        budget = max(2.0, min(10.0, deadline - time.time()))
        rounds += 1
        new_part = _solve_subproblem(free, fixed, by_index, rooms, unavail, hint, allow_theory_in_labs, cap_u,
                                     budget, workers, seed + rounds)
        if new_part is None:
            continue
        candidate = {i: v for i, v in current.items() if i not in free_ids}
        candidate.update(new_part)
        sc = _soft_score(slots, rooms, candidate, allow_theory_in_labs, cap_u)
        if sc > best_score:
            gained = len(candidate) - len(current)
            current, best_score = candidate, sc
            last_gain = time.time()
            res.solutions_found += 1
            if gained or len(current) == len(slots):
                log(f"  [{time.time() - t0:6.1f}s] placed {len(current)}/{len(slots)} classes"
                    f"{' - everything fits!' if len(current) == len(slots) else ''}")

    res.status = f"done ({stop_reason}, {rounds} improvement round(s))"
    res.assignment = {i: (d, u * UNIT, r) for i, (d, u, r) in current.items()}
    res.placed_by_solver = len(res.assignment)
    log(f"Finished: {res.status}; placed {res.placed_by_solver}/{len(slots)} classes cleanly.")

    # 3) leftovers: best-effort slot for anything the rooms/hours can't hold
    left = [s for s in slots if s.index not in res.assignment]
    if left:
        log(f"{len(left)} class(es) cannot fit without a clash - choosing the least-bad slot for each...")
        _place_leftovers(left, slots, rooms, unavail, res, allow_theory_in_labs, {})
    res.violations = count_violations(slots, rooms, unavail, res.assignment, allow_theory_in_labs)
    res.seconds = time.time() - t0
    return res


def _place_leftovers(left, slots, rooms, unavail, res, allow_theory_in_labs, impossible_why):
    by_index = {s.index: s for s in slots}
    # occupancy by day: list of (slot, start, end, room_id)
    occ: Dict[str, List[Tuple[Slot, float, float, str]]] = defaultdict(list)
    for idx, (day, start, rid) in res.assignment.items():
        sl = by_index[idx]
        occ[day].append((sl, start, start + sl.duration_h, rid))
    for s in sorted(left, key=lambda x: (-x.duration_h, x.index)):
        best = None
        cands = candidate_rooms(s, rooms, allow_theory_in_labs)
        starts = []
        t = s.day_start_h
        while t + s.duration_h <= s.day_end_h + 1e-9:
            starts.append(t)
            t += UNIT
        if not starts:                       # window shorter than the class itself
            starts = [s.day_start_h]
        for day in s.allowed_days:
            for st in starts:
                en = st + s.duration_h
                inst_c = batch_c = 0
                room_hits: Dict[str, int] = defaultdict(int)
                for o, o0, o1, orid in occ[day]:
                    if not _overlap(st, en, o0, o1):
                        continue
                    if o.instructor_id == s.instructor_id:
                        inst_c += 1
                    if set(o.batch_ids) & set(s.batch_ids):
                        batch_c += 1
                    room_hits[orid] += 1
                blocked = any(u.faculty_id == s.instructor_id and u.day == day and _overlap(st, en, u.start_h, u.end_h) for u in unavail)
                for r, cost, note in cands:
                    score = 100 * (inst_c + batch_c + room_hits.get(r.id, 0) + (1 if blocked else 0)) + cost / 10.0 + (st - s.day_start_h) * 0.01
                    if best is None or score < best[0]:
                        best = (score, day, st, r, inst_c, batch_c, room_hits.get(r.id, 0), blocked)
        _, day, st, r, ic, bc, rc, blk = best
        res.assignment[s.index] = (day, st, r.id)
        occ[day].append((s, st, st + s.duration_h, r.id))
        bits = []
        if impossible_why.get(s.index):
            bits.append(impossible_why[s.index])
        if ic: bits.append(f"instructor already teaching x{ic}")
        if bc: bits.append(f"batch already in class x{bc}")
        if rc: bits.append(f"room already used x{rc}")
        if blk: bits.append("instructor marked unavailable")
        res.leftover.append((s, "; ".join(bits) or "placed with no clash found (only a soft rule bent)"))


# --------------------------------------------------------------------------
# Writing the solution file the portal accepts
# --------------------------------------------------------------------------
def write_solution(path: str, slots: List[Slot], rooms: List[Room], res: SolveResult) -> None:
    """Sheet "Solution": SlotIndex, Day, StartHour, RoomId (the 4 columns the
    portal reads) + readable extras. Sheet "Summary": B1 clashes, B2 solutions
    found, B3 score - the cells the portal reads. Sheet "Report" is for you."""
    room_by = {r.id: r for r in rooms}
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Solution"
    ws.append(["SlotIndex", "Day", "StartHour", "RoomId", "Class", "Room", "Instructor", "Batch(es)"])
    for s in slots:
        day, start, rid = res.assignment[s.index]
        ws.append([s.index, day, float(start), rid, s.label or f"slot {s.index}", room_by[rid].title() if rid in room_by else rid,
                   s.instructor_name, s.batch_label])
    for col, w in zip("ABCDEFGH", (11, 7, 11, 28, 46, 16, 24, 40)):
        ws.column_dimensions[col].width = w

    sm = wb.create_sheet("Summary")
    sm["A1"], sm["B1"] = "Hard violations (clashes)", res.hard_violations
    sm["A2"], sm["B2"] = "Solutions found", res.solutions_found
    sm["A3"], sm["B3"] = "Score", res.hard_violations * 1000
    sm["A4"], sm["B4"] = "Solver", "Local OR-Tools CP-SAT"
    sm.column_dimensions["A"].width = 28

    rp = wb.create_sheet("Report")
    rp.column_dimensions["A"].width = 120
    lines = ["LOCAL TIMETABLE SOLVER REPORT", ""]
    lines += res.capacity_notes + [""]
    lines.append(f"Status: {res.status}  |  time: {res.seconds:.0f}s  |  classes: {res.total_slots}  |  placed cleanly: {res.placed_by_solver}")
    lines.append(f"Clashes remaining: {res.hard_violations}" + ("" if not res.violations else "  (" + ", ".join(f"{k}: {v}" for k, v in sorted(res.violations.items())) + ")"))
    if res.warnings:
        lines += ["", "WARNINGS"] + [f"  - {w}" for w in res.warnings]
    if res.leftover:
        lines += ["", f"CLASSES THAT COULD NOT BE PLACED WITHOUT A CLASH ({len(res.leftover)}) - shown in the portal with a CLASH flag:"]
        for s, why in res.leftover:
            lines.append(f"  - {s.name()}: {why}")
    elif res.hard_violations == 0:
        lines += ["", "Every class was placed with no clashes."]
    else:
        lines += ["", "No class is double-booked in time. The remaining issue(s) listed above are about room size or similar - see WARNINGS."]
    for ln in lines:
        rp.append([ln])
    wb.save(path)


# --------------------------------------------------------------------------
# Command line
# --------------------------------------------------------------------------
def run(input_path: str, output_path: Optional[str] = None, **kw) -> Tuple[SolveResult, str]:
    slots, rooms, unavail = read_constraints(input_path)
    log = kw.get("log", print)
    log(f"Read {len(slots)} classes, {len(rooms)} rooms, {len(unavail)} blocked instructor times.")
    res = solve(slots, rooms, unavail, **kw)
    out = output_path or os.path.join(os.path.dirname(os.path.abspath(input_path)), "timetable-solution.xlsx")
    write_solution(out, slots, rooms, res)
    log("")
    if res.hard_violations == 0:
        log("RESULT: clash-free timetable found.")
    else:
        log(f"RESULT: {res.hard_violations} clash(es) remain - see the Report sheet in the output file.")
    log(f"Saved: {out}")
    log("Next: in the portal go to Timetable -> Generate & View -> Option A -> upload this file.")
    return res, out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Local timetable solver for the OBE portal.")
    ap.add_argument("input", help="timetable-constraints.xlsx downloaded from the portal")
    ap.add_argument("-o", "--output", help="where to save (default: next to the input)")
    ap.add_argument("--minutes", type=float, default=3.0, help="longest it may run (default 3)")
    ap.add_argument("--patience", type=float, default=45.0, help="stop this many seconds after everything fits and nothing improves (default 45)")
    ap.add_argument("--no-theory-in-labs", action="store_true", help="never put a theory class in a lab room")
    ap.add_argument("--instructor-max-hours", type=float, default=6.0, help="preferred max teaching hours per instructor per day (default 6)")
    a = ap.parse_args(argv)
    try:
        run(a.input, a.output, time_limit_s=a.minutes * 60, patience_s=a.patience,
            allow_theory_in_labs=not a.no_theory_in_labs, instructor_max_hours_per_day=a.instructor_max_hours)
    except Exception as e:  # noqa: BLE001 - friendly message for a non-technical user
        print(f"\nERROR: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
