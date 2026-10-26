"""Weekly grids (days × times) by batch, by instructor and by room — for the Excel sheets, the app's views and the PDF."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass

from .model import Assignment, Problem, Slot, day_sort_key, fmt_time

PALETTE = ["#DCEBFA", "#E3F4E1", "#FFF1CC", "#F9E0E0", "#EADFF7", "#DDF3F3", "#FDE7D4", "#E8EAED", "#F3E5F5", "#E0F2F1", "#FFF8E1", "#E8F5E9"]


def course_key(s: Slot) -> str:
    return (s.label.split(" ")[0] if s.label else s.section_id).upper()


def color_for(s: Slot) -> str:
    h = int(hashlib.md5(course_key(s).encode()).hexdigest(), 16)
    return PALETTE[h % len(PALETTE)]


@dataclass
class Entry:
    slot_index: int
    day: str
    start: int
    length: int
    text: str
    color: str


@dataclass
class Block:
    key: str
    title: str
    days: list[str]
    times: list[int]
    entries: list[Entry]


def grid_blocks(problem: Problem, a: Assignment, kind: str) -> list[Block]:
    """kind: 'batch' | 'instructor' | 'room'."""
    groups: dict[str, tuple[str, list[Slot]]] = {}
    for s in problem.slots:
        p = a.get(s.index)
        if p is None:
            continue
        if kind == "batch":
            for b in s.batch_ids:
                groups.setdefault(b, (s.batch_name(b), []))[1].append(s)
        elif kind == "instructor":
            groups.setdefault(s.instructor_id, (s.teacher, []))[1].append(s)
        else:
            room = problem.room_by_id.get(p.room_id)
            groups.setdefault(p.room_id, (f"{room.label} ({room.type}, {room.capacity} seats)" if room else p.room_id, []))[1].append(s)
    days = problem.days
    blocks = []
    for key, (title, slots) in sorted(groups.items(), key=lambda kv: kv[1][0].lower()):
        lo = min(min(s.day_start for s in slots), min(int(a[s.index].start) for s in slots))
        hi = max(max(s.day_end for s in slots), max(int(a[s.index].start) + s.duration for s in slots))
        entries = []
        for s in slots:
            p = a[s.index]
            room = problem.room_by_id.get(p.room_id)
            lines = [s.label or s.section_id]
            if kind != "instructor":
                lines.append(s.teacher)
            if kind != "room":
                lines.append(room.label if room else p.room_id)
            if kind != "batch":
                lines.append(", ".join(s.batch_name(b) for b in s.batch_ids))
            lines.append(f"{fmt_time(int(p.start))}–{fmt_time(int(p.start) + s.duration)}")
            entries.append(Entry(s.index, p.day, int(p.start), s.duration, "\n".join(x for x in lines if x), color_for(s)))
        used_days = sorted(set(days) | {e.day for e in entries}, key=day_sort_key)
        blocks.append(Block(key, title, used_days, list(range(lo, hi)), sorted(entries, key=lambda e: (day_sort_key(e.day), e.start))))
    return blocks


def write_pdf(path: str, problem: Problem, a: Assignment, kinds: tuple[str, ...] = ("batch", "instructor", "room"), title: str = "Timetable") -> None:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Table, TableStyle

    styles = getSampleStyleSheet()
    cell = ParagraphStyle("cell", parent=styles["BodyText"], fontSize=6.5, leading=7.6)
    doc = SimpleDocTemplate(path, pagesize=landscape(A4), leftMargin=10 * mm, rightMargin=10 * mm, topMargin=10 * mm, bottomMargin=10 * mm, title=title)
    story = []
    names = {"batch": "By batch", "instructor": "By instructor", "room": "By room"}
    width = landscape(A4)[0] - 20 * mm
    for kind in kinds:
        for b in grid_blocks(problem, a, kind):
            story.append(Paragraph(f"<b>{names[kind]} · {_esc(b.title)}</b>", styles["Heading3"]))
            data = [["Time"] + b.days] + [[fmt_time(t)] + [""] * len(b.days) for t in b.times]
            style = [("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#C9CED6")), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0D2A4A")),
                     ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTSIZE", (0, 0), (-1, -1), 7), ("VALIGN", (0, 0), (-1, -1), "TOP")]
            for e in b.entries:
                c = 1 + b.days.index(e.day)
                r = 1 + b.times.index(e.start)
                data[r][c] = Paragraph(_esc(e.text).replace("\n", "<br/>"), cell)
                end = min(r + e.length - 1, len(b.times))
                if end > r:
                    style.append(("SPAN", (c, r), (c, end)))
                style.append(("BACKGROUND", (c, r), (c, end), colors.HexColor(e.color)))
            col = (width - 14 * mm) / max(1, len(b.days))
            rh = max(5.0, min(10.0, 160.0 / max(1, len(b.times)))) * mm  # fill the page, never cramped
            t = Table(data, colWidths=[14 * mm] + [col] * len(b.days), rowHeights=[None] + [rh] * len(b.times), repeatRows=1)
            t.setStyle(TableStyle(style))
            story += [t, PageBreak()]
    if not story:
        story.append(Paragraph("No sessions.", styles["BodyText"]))
    doc.build(story)


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def explain(problem: Problem, a: Assignment, slot_index: int) -> list[str]:
    """Why a class sits where it does: its rules and how the chosen place serves the soft rules."""
    s = problem.slot_by_index[slot_index]
    p = a[slot_index]
    room = problem.room_by_id.get(p.room_id)
    fitting = problem.rooms_for(s)
    lines = [
        f"{s.name} · {s.teacher} · {', '.join(s.batch_name(b) for b in s.batch_ids)}",
        f"Placed {p.day} {fmt_time(int(p.start))}–{fmt_time(int(p.start) + s.duration)} in {room.label if room else p.room_id}.",
        f"Allowed: {', '.join(s.allowed_days)} between {fmt_time(s.day_start)} and {fmt_time(s.day_end)}; needs a {s.room_type} room for {s.students}.",
    ]
    if room and fitting:
        rank = [r.id for r in fitting].index(room.id) if room.id in [r.id for r in fitting] else -1
        lines.append("Smallest room that fits." if rank == 0 else f"Room is the {rank + 1}{'nd' if rank == 1 else 'rd' if rank == 2 else 'th'} smallest that fits (the smaller ones were busy or splitting the section's rooms).")
    others = [problem.slot_by_index[i] for i in a if problem.slot_by_index.get(i) and problem.slot_by_index[i].section_id == s.section_id and i != slot_index]
    if others:
        lines.append("Other sessions of this section: " + ", ".join(f"{a[o.index].day} {fmt_time(int(a[o.index].start))}" for o in others) + " — each on its own day.")
    if s.preferred_days:
        lines.append(("On one of the teacher's preferred days (" if p.day in s.preferred_days else "Not on a preferred day (") + ", ".join(s.preferred_days) + ").")
    unav = [u for u in problem.unavailable(s.instructor_id) if u.day == p.day]
    if unav:
        lines.append("Teacher unavailable that day: " + ", ".join(f"{fmt_time(u.start)}–{fmt_time(u.end)}" for u in unav) + " (kept clear).")
    for b in s.batch_ids:
        day = sorted((int(a[x.index].start), x) for x in problem.slots if b in x.batch_ids and x.index in a and a[x.index].day == p.day)
        lines.append(f"{s.batch_name(b)} on {p.day}: " + ", ".join(f"{fmt_time(t)} {x.label or x.section_id}" for t, x in day))
    return lines
