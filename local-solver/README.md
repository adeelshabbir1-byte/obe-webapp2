# Local Timetable Solver
> New to this? Follow **STEP_BY_STEP.md** — plain-language steps with screenshots-free instructions.

A program that runs **on your own computer** (not the web portal) and builds the
timetable properly, using Google's OR-Tools constraint solver. There is no web
time limit. On a test that mirrored a mid-size department (389 weekly class
sessions, 15 rooms), the web generator was still at 413 clashes after 2 minutes,
and this program found a clash-free timetable in about 20 seconds.

## Using it (4 steps)

1. In the portal: **Timetable → Generate & View → Option A → "1. Download Constraints (Excel)"**.
2. Open this program (see "First-time setup" below), click **Browse**, choose that file, click **Start**.
3. Wait until it says finished (watch the log; you can press *Stop and use best so far* any time).
   It saves **timetable-solution.xlsx** next to the file you chose.
4. In the portal, upload that file with the **Upload Solution** button in Option A.
   Then use the Timetable page as usual (view, drag to adjust, reports).

## First-time setup (Windows)

Easiest: install **Python** once from python.org (on the first installer screen tick
**"Add python.exe to PATH"**), then double-click **run_solver.bat**. The first run
downloads the solver components (needs internet, about a minute); after that it opens
instantly.

Optional single-file program: double-click **build_exe.bat** once; it creates
`dist\TimetableSolver.exe`, which you can copy to any Windows PC with no Python.

## What it guarantees, and what it tries

It only ever places a class where **all** of these hold: instructor free, room free,
batch free (a combined/clubbed class blocks every batch it covers), inside the batch's
days and hours, not in the instructor's blocked times, right room type, enough seats.

It also *tries* to: keep a section's weekly sessions on different days, keep an
instructor under 6 teaching hours a day, and prefer earlier in the day.

### "Allow theory classes in lab rooms"
Ticked by default. If lecture rooms run out, a theory class may use a lab room that is
free (it costs the solver extra, so lecture rooms are always preferred; lab classes
themselves never go into lecture rooms).

### If the rooms/hours simply can't hold everything
It does not fail. It places as much as is physically possible, puts each leftover class
in its least-bad slot, and writes the details on the **Report** sheet of the output file
(which classes, and why). In the portal those classes show with a CLASH flag. The first
lines of the log also tell you up front how many room-hours you need versus have, e.g.
"Lecture rooms: 546 room-hours needed vs 480 available". If that says WARNING, fix the
capacity (add rooms, widen hours, or allow theory in labs) rather than waiting longer.

## Files

| File | What it is |
|---|---|
| `timetable_solver_gui.py` | the window |
| `solve_timetable.py` | the solver (also usable from the command line: `python solve_timetable.py constraints.xlsx --minutes 5`) |
| `run_solver.bat` / `build_exe.bat` | Windows helpers |
| `make_test_data.py` | makes made-up data to try it without touching real data |
| `test_roundtrip.py` | independent checker: `python test_roundtrip.py constraints.xlsx solution.xlsx` |

## Known limits

* It only knows what the portal puts in the constraints file: rooms, hours, instructor
  blocked times, sections. Anything not recorded in the portal (e.g. a daily prayer or
  lunch break, a faculty member's preferred days) is not considered.
* A section's student count is the batch size; for combined classes it is the combined
  total shared evenly across that class's sections (same approximation the portal uses).
* After uploading, the portal's own drag-to-move checks clashes for room, instructor and
  batch, but does not check room *type*, so a theory class sitting in a lab room is not flagged.
