"""Quick checks that prove a clash-free timetable can't exist, each said in plain words.

Every check is a necessary condition, so any message here is a real reason, e.g.
  "Dr Khan has 22 hours in a 20-hour window"   "No Lab room holds 60 students for CS-201 Lab A"
"""
from __future__ import annotations

from .model import Problem, Slot, fmt_time, overlaps


def _hours(half: int) -> str:
    h = half / 2
    return f"{h:g} hour" + ("" if h == 1 else "s")


def free_starts(problem: Problem, s: Slot) -> dict[str, list[int]]:
    """Every (day, start) a session could take on its own: allowed day, inside the hours, teacher available."""
    unav = problem.unavailable(s.instructor_id)
    out: dict[str, list[int]] = {}
    for d in s.allowed_days:
        starts = [t for t in range(s.day_start, s.day_end - s.duration + 1)
                  if not any(u.day == d and overlaps(t, t + s.duration, u.start, u.end) for u in unav)]
        if starts:
            out[d] = starts
    return out


def _window(problem: Problem, slots: list[Slot], teacher: str | None) -> int:
    """Half-hours available over the week to a set of sessions: the union of their days and hours, less the teacher's unavailability."""
    by_day: dict[str, set[int]] = {}
    for s in slots:
        for d in s.allowed_days:
            by_day.setdefault(d, set()).update(range(s.day_start, s.day_end))
    if teacher:
        for u in problem.unavailable(teacher):
            if u.day in by_day:
                by_day[u.day] -= set(range(u.start, u.end))
    return sum(len(v) for v in by_day.values())


def precheck(problem: Problem, max_section: int = 50) -> list[str]:
    reasons: list[str] = []
    # The portal never makes a section of more than its limit (default 50); a bigger one means the file is out of date.
    for s in problem.slots:
        if max_section and s.students > max_section:
            reasons.append(f"{s.name} has {s.students} students — over the {max_section} limit; regenerate sections on the portal (Timetable → Sections → Auto-generate sections).")
    rooms_by_type: dict[str, list] = {}
    for r in problem.rooms:
        rooms_by_type.setdefault(r.type, []).append(r)

    for s in problem.slots:
        same_type = rooms_by_type.get(s.room_type, [])
        if not same_type:
            reasons.append(f"There is no {s.room_type} room at all, but {s.name} needs one.")
        elif not problem.rooms_for(s):
            biggest = max(r.capacity for r in same_type)
            reasons.append(f"No {s.room_type} room holds {s.students} students for {s.name} (the biggest {s.room_type} room holds {biggest}).")
        if s.duration > s.day_end - s.day_start:
            reasons.append(f"{s.name} lasts {_hours(s.duration)}, but its day is only {fmt_time(s.day_start)}–{fmt_time(s.day_end)}.")
        elif not free_starts(problem, s):
            reasons.append(f"{s.teacher} is unavailable at every time {s.name} could take ({', '.join(s.allowed_days)} {fmt_time(s.day_start)}–{fmt_time(s.day_end)}).")

    for sid, slots in problem.sections.items():
        days = set(slots[0].allowed_days)
        for s in slots[1:]:
            days &= set(s.allowed_days)
        if len(slots) > len(days):
            reasons.append(f"{slots[0].name} meets {len(slots)} times a week, but each session must be on a different day and only {len(days)} day(s) are allowed.")

    for tid, name in problem.instructors.items():
        mine = [s for s in problem.slots if s.instructor_id == tid]
        need, have = sum(s.duration for s in mine), _window(problem, mine, tid)
        if need > have:
            reasons.append(f"{name} has {_hours(need)} of classes in a window of {_hours(have)} (after their unavailable times).")

    for bid, name in problem.batches.items():
        mine = [s for s in problem.slots if bid in s.batch_ids]
        need, have = sum(s.duration for s in mine), _window(problem, mine, None)
        if need > have:
            reasons.append(f"{name} has {_hours(need)} of classes in a week of {_hours(have)}.")

    # Rooms: for every room type and class size, the sessions that need at least that many seats must fit in the rooms that big.
    for rtype, rooms in rooms_by_type.items():
        need_type = [s for s in problem.slots if s.room_type == rtype]
        for size in sorted({s.students for s in need_type}):
            big = [r for r in rooms if r.capacity >= size]
            needing = [s for s in need_type if s.students >= size]
            if not big or not needing:
                continue
            need = sum(s.duration for s in needing)
            have = len(big) * _window(problem, needing, None)
            if need > have:
                reasons.append(f"{len(needing)} {rtype} sessions need {size}+ seats ({_hours(need)} a week), but the {len(big)} {rtype} room(s) that big give only {_hours(have)}.")
    return reasons
