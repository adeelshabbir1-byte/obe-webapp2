# OBEHUB Timetable Solver (desktop app)

Makes a **clash-free** weekly timetable from the portal's `timetable-constraints.xlsx`, optimises it on the soft rules,
and saves `timetable-solution.xlsx` for the portal to upload. Runs on Windows, macOS and Linux. No internet, no login:
everything stays on your computer.

It uses Google OR-Tools **CP-SAT**, which either finds a clash-free timetable or **proves** none exists. In the second
case it says why in plain words (e.g. *"Dr Khan has 22 hours of classes in a window of 20 hours"*, *"No LAB room holds
60 students for CS-201 Lab A"*). It never exports a timetable with clashes unless you explicitly tick **Export with
violations** — and then the Summary shows the real count.

## Using it (Program Lead)

1. Portal → **Timetable** → **Download Constraints (Excel)** → `timetable-constraints.xlsx`.
2. Open the app (`OBEHUB-Timetable-Solver.exe` on Windows) → **Open timetable-constraints.xlsx…**. The Open screen lists
   sessions, sections, batches, instructors and rooms, and every problem in the file (e.g. *"Sections row 14:
   DurationHours empty"*), plus anything that makes a clash-free timetable impossible.
3. **Settings** (optional): time limit (default 120 s), CPU threads (default all cores), the soft-rule weights and the
   overload limits.
4. **Generate**. The first clash-free timetable usually appears within seconds; it then keeps improving. Live:
   best score, hard violations (always 0 once one is found), elapsed time. **Stop** keeps the best so far.
5. **Views**: weekly grids by batch, by instructor and by room, coloured per course. Click a class to see why it sits
   there. **Drag** a class to another day/time, or pick another room on the right — the checker runs live and refuses
   any move that would cause a clash, with the reason. Moved classes are locked; **Re-optimise around my fixed changes**
   solves again around them.
6. **Export** → **Save timetable-solution.xlsx…** (and a PDF of the grids). The independent checker runs again first;
   only 0 violations can be exported.
7. Portal → **Timetable** → **Upload Solution**.

You can also open any `timetable-solution.xlsx` later (**Check a solution file…**) to re-check it against the
constraints, view it, edit it and export it again.

## Rules

**Hard (always hold)**
1. Every session gets exactly one day, start time and room.
2. The day is one of the session's `AllowedDays`.
3. Start ≥ `DayStartHour`, start + duration ≤ `DayEndHour`, on the 30-minute grid.
4. Room `Type` = `RoomTypeNeeded`, room `Capacity` ≥ `StudentCount`.
5. No teacher has two sessions at once.
6. No room has two sessions at once.
7. No two sessions sharing **any** batch in `BatchId` overlap (a combined class counts for every member batch).
8. No teacher is scheduled inside their `Unavailability` (this includes the Friday prayer break the portal adds).
9. The sessions of one section are on **different days** (even if their times wouldn't overlap).

**Soft (optimised, weights editable in Settings, in this order of priority)**
compact student days (few idle gaps) · a section's sessions spread across the week (Mon/Wed, Tue/Thu rather than
neighbouring days) · teachers' `PreferredDays` · no overload (≤ 6 h a day per batch, ≤ 5 h per teacher, ≤ 3 h in a row
without a break) · balanced week · best-fit rooms (smallest that fits) · fewer late slots (last hour of the day) · the
same room for all of a section's sessions.

## How it solves

1. **Pre-checks** (instant): each teacher's and batch's hours against their window, a room of each type and size for
   every session, enough room-hours for each type and size, every section's sessions against its allowed days. Any of
   these is a proof of impossibility and is reported in plain words.
2. **Times** (CP-SAT): one boolean per possible start of each session (only starts its own rules allow); at every
   half-hour at most one session per teacher and per batch; at most one session of a section per day; and for each room
   type and size, never more sessions than rooms. First without soft rules (fast), then with them, starting from that
   timetable.
3. **Rooms** (CP-SAT): with the times fixed, a room per session (best fit, same room for a section), at most one session
   per room at a time. If this ever failed, one combined model with times and rooms together is solved.
4. **Independent checker** (`ttsolver/checker.py`, shares no code with the solver): re-verifies rules 1–9 on the final
   timetable, before every export and on any solution file opened later.

If no clash-free timetable exists, the app solves again with the hard rules turned into heavy penalties and lists
exactly which rules had to break and where (it is shown, but not exportable unless you tick *Export with violations*).

## Files

**Input — `timetable-constraints.xlsx`** (read by sheet and column name; unknown extra columns are ignored)

| Sheet | Columns |
|---|---|
| Sections | `SlotIndex`, `ScheduleSectionId`, `BatchId` (comma list), `InstructorId`, `RoomTypeNeeded`, `DurationHours` (half-hour steps), `StudentCount`, `AllowedDays` (e.g. `Mon,Tue,Wed,Thu,Fri`), `DayStartHour`, `DayEndHour` (8.5 = 08:30); optional `Label`, `InstructorName`, `BatchLabels`, `PreferredDays` |
| Rooms | `RoomId`, `Type`, `Capacity`; optional `RoomName` |
| Unavailability | `FacultyId`, `DayOfWeek`, `StartHour`, `EndHour` |

**Output — `timetable-solution.xlsx`** (exactly what the portal's upload reads)

| Sheet | Content |
|---|---|
| Solution | row 1 header; col 1 `SlotIndex`, col 2 `Day` (same tokens as `AllowedDays`), col 3 `StartHour` (decimal), col 4 `RoomId` — one row for **every** session; extra readable columns: Label, Instructor, Batches, Room name, End |
| Summary | `B1` hard violations, `B2` solver branches, `B3` objective score (labels in A1–A3) |
| By batch, By instructor, By room | weekly grids for printing |

## Run from source

Python 3.11+.

```bash
cd desktop/timetable-solver
python -m venv .venv
.venv\Scripts\activate          # macOS / Linux: source .venv/bin/activate
pip install -r requirements.txt
python run_solver.py            # the app
python run_solver.py solve timetable-constraints.xlsx timetable-solution.xlsx --time 120 --pdf timetable.pdf
python run_solver.py check timetable-constraints.xlsx timetable-solution.xlsx
```

## Build the single-file app

```bash
pip install -r requirements-dev.txt
python build.py                 # → dist/OBEHUB-Timetable-Solver.exe (Windows), or the macOS / Linux binary
```

GitHub Actions (`.github/workflows/timetable-solver.yml`) runs the tests and builds Windows, macOS and Linux binaries on
every change to this folder (downloadable from the run's *Artifacts*). Pushing a tag `timetable-solver-v1.0.0` also
publishes a GitHub release with the binaries attached; the portal's Timetable page links to the latest release.

## Tests

```bash
pip install -r requirements-dev.txt
python -m pytest                 # all, including the 600-session performance test (about 2 minutes)
python -m pytest -k "not 600"    # quick
```

- `tests/test_checker.py` — each hard rule of the checker.
- `tests/test_solver.py` — a tiny input solved with 0 violations; impossible inputs reported with their reason (teacher
  hours, room size, a pure clash with the relaxed report); the round trip generate → Solution/Summary → read back the way
  the portal's upload route reads it → the slot count matches; file validation messages.
- `tests/test_gui.py` — the app driven headless: open, generate, a refused clash move, a good move, re-optimise, export.
- `tests/test_performance.py` — 600 sessions, 40 rooms, 80 teachers: clash-free within 120 s.

## Code

| File | What it does |
|---|---|
| `ttsolver/io_xlsx.py` | reads and validates the constraints file; writes / reads the solution file |
| `ttsolver/model.py` | sessions, rooms, unavailability, placements (times in half-hours) |
| `ttsolver/precheck.py` | plain-word proofs that a timetable is impossible |
| `ttsolver/solver.py` | the CP-SAT models (times, rooms, combined, relaxed) and the solve flow |
| `ttsolver/softscore.py` | the soft-rule measures of a finished timetable |
| `ttsolver/checker.py` | the independent checker (hard rules 1–9) |
| `ttsolver/report.py` | weekly grids, PDF, "why it sits there" |
| `ttsolver/gui.py`, `ttsolver/cli.py` | the app window and the command line |
