"""Measures a finished timetable on the soft rules, in the same units the solver's objective uses (lower is better).
The score is sum(weight × measure); the breakdown is shown in the app so the Program Lead sees what costs what."""
from __future__ import annotations

from .model import Assignment, Problem, day_sort_key


def soft_breakdown(p: Problem, a: Assignment, st) -> dict[str, int]:
    out = {k: 0 for k in ("compact", "spread", "preferred", "overload", "balance", "bestfit", "late", "stable")}
    run = int(round(st.max_in_a_row * 2)) + 1
    for s in p.slots:
        x = a.get(s.index)
        if x is None:
            continue
        if x.start + s.duration > s.day_end - 2:
            out["late"] += 1
        if s.preferred_days and x.day not in s.preferred_days:
            out["preferred"] += 2
        fit = [r.id for r in p.rooms_for(s)]
        if x.room_id in fit:
            out["bestfit"] += min(fit.index(x.room_id), 5)
    for sid, slots in p.sections.items():
        placed = [s for s in slots if s.index in a]
        days = [day_sort_key(a[s.index].day) for s in placed]
        for i in range(len(days)):
            for j in range(i + 1, len(days)):
                if abs(days[i] - days[j]) == 1:
                    out["spread"] += 2
        if len(placed) > 1:
            out["stable"] += len({a[s.index].room_id for s in placed}) - 1
    resources: dict[str, list] = {}
    for s in p.slots:
        resources.setdefault("T:" + s.instructor_id, []).append(s)
        for b in s.batch_ids:
            resources.setdefault("B:" + b, []).append(s)
    for key, slots in resources.items():
        batch = key.startswith("B:")
        cap = int(round((st.max_batch_hours if batch else st.max_teacher_hours) * 2))
        days = {d for s in slots for d in s.allowed_days}
        loads = {}
        for d in days:
            here = [s for s in slots if s.index in a and a[s.index].day == d]
            load = sum(s.duration for s in here)
            loads[d] = load
            out["overload"] += max(0, load - cap)
            busy = set()
            for s in here:
                busy.update(range(int(a[s.index].start), int(a[s.index].start) + s.duration))
            out["overload"] += 2 * sum(1 for h in busy if all(h + j in busy for j in range(run)))
            if batch and len(here) > 1:
                first = min(int(a[s.index].start) for s in here)
                last = max(int(a[s.index].start) + s.duration for s in here)
                out["compact"] += last - first - load
        if len(loads) > 1:
            out["balance"] += max(loads.values()) - min(loads.values())
    return out
