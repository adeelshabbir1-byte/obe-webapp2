"""Data model shared by every part of the solver.

Times are kept in half-hours from midnight (8.5 h = 17) so that every rule works on whole numbers; the portal's files use
decimal hours on a 30-minute grid.
"""
from __future__ import annotations

from dataclasses import dataclass, field

DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
HALF_HOURS_PER_DAY = 48  # one day on the "week clock" (days never overlap each other)


def to_half(hours: float) -> int:
    """8.5 -> 17. Values off the 30-minute grid are rounded to the nearest half hour."""
    return int(round(float(hours) * 2))


def to_hours(half: int) -> float:
    return half / 2


def fmt_time(half: int) -> str:
    """17 -> '08:30'."""
    return f"{int(half // 2):02d}:{int(round((half % 2) * 30)):02d}"


def day_sort_key(day: str) -> int:
    return DAY_ORDER.index(day) if day in DAY_ORDER else len(DAY_ORDER)


@dataclass
class Slot:
    """One weekly session of a section (a section with 3 sessions a week gives 3 slots)."""
    index: int  # SlotIndex from the file
    section_id: str
    batch_ids: list[str]
    instructor_id: str
    room_type: str
    duration: int  # half-hours
    students: int
    allowed_days: list[str]
    day_start: int  # half-hours
    day_end: int
    label: str = ""
    instructor_name: str = ""
    batch_labels: list[str] = field(default_factory=list)
    preferred_days: list[str] = field(default_factory=list)
    row: int = 0  # row in the Sections sheet (for messages)

    @property
    def name(self) -> str:
        return self.label or f"slot {self.index}"

    @property
    def teacher(self) -> str:
        return self.instructor_name or self.instructor_id

    def batch_name(self, batch_id: str) -> str:
        try:
            return self.batch_labels[self.batch_ids.index(batch_id)] or batch_id
        except (ValueError, IndexError):
            return batch_id


@dataclass
class Room:
    id: str
    type: str
    capacity: int
    name: str = ""

    @property
    def label(self) -> str:
        return self.name or self.id


@dataclass
class Unavailability:
    faculty_id: str
    day: str
    start: int  # half-hours
    end: int


@dataclass
class Problem:
    slots: list[Slot]
    rooms: list[Room]
    unavailability: list[Unavailability]
    source: str = ""

    def __post_init__(self) -> None:
        self.room_by_id = {r.id: r for r in self.rooms}
        self.slot_by_index = {s.index: s for s in self.slots}

    @property
    def days(self) -> list[str]:
        ds = {d for s in self.slots for d in s.allowed_days}
        return sorted(ds, key=day_sort_key)

    @property
    def batches(self) -> dict[str, str]:
        out: dict[str, str] = {}
        for s in self.slots:
            for b in s.batch_ids:
                out.setdefault(b, s.batch_name(b))
        return out

    @property
    def instructors(self) -> dict[str, str]:
        out: dict[str, str] = {}
        for s in self.slots:
            out.setdefault(s.instructor_id, s.teacher)
        return out

    @property
    def sections(self) -> dict[str, list[Slot]]:
        out: dict[str, list[Slot]] = {}
        for s in self.slots:
            out.setdefault(s.section_id, []).append(s)
        return out

    def rooms_for(self, slot: Slot) -> list[Room]:
        """Rooms of the needed type that hold the class, smallest first."""
        return sorted((r for r in self.rooms if r.type == slot.room_type and r.capacity >= slot.students), key=lambda r: (r.capacity, r.id))

    def unavailable(self, faculty_id: str) -> list[Unavailability]:
        return [u for u in self.unavailability if u.faculty_id == faculty_id]


@dataclass
class Placement:
    day: str
    start: int  # half-hours
    room_id: str


Assignment = dict[int, Placement]  # SlotIndex -> placement


def overlaps(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    return a_start < b_end and b_start < a_end
