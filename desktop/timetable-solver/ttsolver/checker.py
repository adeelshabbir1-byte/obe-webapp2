"""Independent checker: re-verifies every hard rule on a finished timetable.

It shares nothing with the solver except the data model, so a mistake in the solver can't hide here. It runs before
every export, on any solution file opened later, and live while the user moves classes by hand.

Hard rules
 1 every slot has exactly one day, start time and room       6 no room clash
 2 the day is one of the slot's AllowedDays                   7 no student clash (slots sharing any batch)
 3 inside DayStartHour..DayEndHour, on the 30-minute grid     8 never inside the teacher's Unavailability
 4 room type = RoomTypeNeeded and capacity >= StudentCount    9 sessions of one section on different days
 5 no instructor clash
"""
from __future__ import annotations

from dataclasses import dataclass

from .model import Assignment, Placement, Problem, Slot, fmt_time, overlaps

RULES = {
    1: "Every session placed once", 2: "Allowed days", 3: "Inside the day's hours", 4: "Right room type and size",
    5: "No teacher clash", 6: "No room clash", 7: "No student clash", 8: "Teacher available", 9: "A section's sessions on different days",
}


@dataclass
class Violation:
    rule: int
    message: str
    slots: tuple[int, ...]

    def __str__(self) -> str:
        return f"Rule {self.rule} ({RULES[self.rule]}): {self.message}"


def _when(s: Slot, p: Placement) -> str:
    return f"{p.day} {fmt_time(p.start)}–{fmt_time(p.start + s.duration)}"


def check_slot(problem: Problem, s: Slot, p: Placement) -> list[Violation]:
    """Rules 2, 3, 4 and 8 — the ones that concern a single session."""
    out: list[Violation] = []
    if p.day not in s.allowed_days:
        out.append(Violation(2, f"{s.name} is on {p.day}, but its batch only meets on {', '.join(s.allowed_days)}", (s.index,)))
    if p.start != int(p.start):
        out.append(Violation(3, f"{s.name} starts at {p.start / 2:g} h, which is not on the 30-minute grid", (s.index,)))
    if p.start < s.day_start or p.start + s.duration > s.day_end:
        out.append(Violation(3, f"{s.name} at {_when(s, p)} is outside {fmt_time(s.day_start)}–{fmt_time(s.day_end)}", (s.index,)))
    room = problem.room_by_id.get(p.room_id)
    if room is None:
        out.append(Violation(4, f"{s.name} is in room {p.room_id!r}, which is not in the Rooms sheet", (s.index,)))
    else:
        if room.type != s.room_type:
            out.append(Violation(4, f"{s.name} needs a {s.room_type} room but is in {room.label} ({room.type})", (s.index,)))
        if room.capacity < s.students:
            out.append(Violation(4, f"{s.name} has {s.students} students but {room.label} holds {room.capacity}", (s.index,)))
    for u in problem.unavailable(s.instructor_id):
        if u.day == p.day and overlaps(p.start, p.start + s.duration, u.start, u.end):
            out.append(Violation(8, f"{s.teacher} is unavailable {u.day} {fmt_time(u.start)}–{fmt_time(u.end)} but teaches {s.name} at {_when(s, p)}", (s.index,)))
    return out


def check(problem: Problem, assignment: Assignment) -> list[Violation]:
    out: list[Violation] = []
    placed: list[tuple[Slot, Placement]] = []
    for s in problem.slots:
        p = assignment.get(s.index)
        if p is None or not p.day or p.room_id in (None, ""):
            out.append(Violation(1, f"{s.name} has no day, time or room", (s.index,)))
            continue
        placed.append((s, p))
        out.extend(check_slot(problem, s, p))
    extra = set(assignment) - set(problem.slot_by_index)
    for i in sorted(extra):
        out.append(Violation(1, f"the solution has slot {i}, which is not in the constraints file", (i,)))

    # Pairwise rules, compared only within one day (sorted sweep keeps it fast for thousands of sessions).
    by_day: dict[str, list[tuple[Slot, Placement]]] = {}
    for s, p in placed:
        by_day.setdefault(p.day, []).append((s, p))
    for day, items in by_day.items():
        items.sort(key=lambda x: x[1].start)
        for a in range(len(items)):
            s, p = items[a]
            for b in range(a + 1, len(items)):
                t, q = items[b]
                if q.start >= p.start + s.duration:
                    break  # sorted by start: nothing later overlaps s
                if t.instructor_id == s.instructor_id:
                    out.append(Violation(5, f"{s.teacher} has {s.name} and {t.name} at the same time ({day} {fmt_time(max(p.start, q.start))})", (s.index, t.index)))
                if q.room_id == p.room_id:
                    room = problem.room_by_id.get(p.room_id)
                    out.append(Violation(6, f"{room.label if room else p.room_id} has {s.name} and {t.name} at the same time ({day} {fmt_time(max(p.start, q.start))})", (s.index, t.index)))
                shared = [x for x in s.batch_ids if x in t.batch_ids]
                if shared:
                    out.append(Violation(7, f"{s.batch_name(shared[0])} has {s.name} and {t.name} at the same time ({day} {fmt_time(max(p.start, q.start))})", (s.index, t.index)))
        seen: dict[str, Slot] = {}
        for s, p in items:
            other = seen.get(s.section_id)
            if other is not None:
                out.append(Violation(9, f"{s.name} meets twice on {day} (sessions {other.index} and {s.index})", (other.index, s.index)))
            else:
                seen[s.section_id] = s
    return out


def move_problems(problem: Problem, assignment: Assignment, slot_index: int, new: Placement) -> list[Violation]:
    """What would break if one session moved to `new` (for manual editing)."""
    trial = dict(assignment)
    trial[slot_index] = new
    before = {(v.rule, v.slots) for v in check(problem, assignment)}
    return [v for v in check(problem, trial) if slot_index in v.slots and (v.rule, v.slots) not in before]
