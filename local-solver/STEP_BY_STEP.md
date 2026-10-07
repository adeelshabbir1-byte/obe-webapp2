# Running the Local Timetable Solver — step by step (Windows)

You do steps 1–2 **once**. After that, only steps 3–7 each time you want a timetable.

## One-time setup

**Step 1 — Install Python (free)**
1. Go to https://www.python.org/downloads/ and click the big yellow **Download Python** button.
2. Open the downloaded file. On the first screen, **tick "Add python.exe to PATH"** (bottom of the window), then click **Install Now**.
3. Click Close when it says "Setup was successful".

**Step 2 — Unzip the solver**
1. Right-click `local-solver.zip` → **Extract All…** → put it somewhere easy, e.g. `C:\local-solver`.
2. Open that folder. You should see `run_solver.bat`, `solve_timetable.py`, `README.md` and others.

## Every time you want a timetable

**Step 3 — Download the constraints file from the portal**
1. Log in as Program Coordinator → **Timetable** → make sure Sections are generated.
2. Open the **Generate & View** tab. Check the *Readiness Summary* — if "needed" room hours are higher than "available", add rooms or reduce sections first.
3. Under **Option A**, click the brass button **1. Download Constraints (Excel)**. You get `timetable-constraints.xlsx` (usually in Downloads).

**Step 4 — Start the solver**
1. In the `local-solver` folder, **double-click `run_solver.bat`**.
2. The very first time it installs two small helper packages (needs internet, 2–5 minutes). A black window shows progress — leave it open.
3. A window titled **Local Timetable Solver** opens.
   - If Windows says "Windows protected your PC", click **More info → Run anyway** (the file is just a script).
   - If the window never opens, see "If something goes wrong" below.

**Step 5 — Solve**
1. Click **Browse…** and choose the `timetable-constraints.xlsx` you downloaded.
2. Leave **minutes** at 5 (it stops early if it can't improve). Use 15–30 for a harder problem.
3. Leave **Allow theory classes in lab rooms when lecture rooms are full** ticked if you want that (labs are used only when lecture rooms are full).
4. Click **Start**. The log shows "Quick first draft…", then "improvement rounds". Wait for the **Finished** box.
   - Need to stop early? Click **Stop and use best so far**.

**Step 6 — Find the result**
The solver saves `timetable-solution.xlsx` next to your constraints file. Click **Open the folder with the result** to see it.
Open it in Excel if you like: the *Solution* sheet shows every class with its day, time, room, instructor and batch; the *Report* sheet lists anything it could not place cleanly.

**Step 7 — Upload it to the portal**
1. Back in the portal: **Timetable → Generate & View → Option A**.
2. Next to the download button, click **Choose file**, pick `timetable-solution.xlsx`, then click **Upload Solution**.
3. The timetable appears in the grid. You can still drag/adjust individual classes afterwards.

## If something goes wrong

First, double-click **`check_setup.bat`**. It prints a short checklist ([OK] / [X]) of what your computer has. `run_solver.bat` now also keeps its window open on any problem and writes `solver_log.txt` next to it — send that file if you need help.

Best Python version: **3.12** (very new versions, e.g. 3.14, often have no solver library yet).

| What you see | What to do |
|---|---|
| `'python' is not recognized` | Python was installed without "Add to PATH". Run the Python installer again → **Modify/Repair** → tick *Add to PATH*, or reinstall. Then double-click `run_solver.bat` again. |
| The window never opens | Open the folder, click the address bar, type `cmd`, press Enter, then type: `python solve_timetable.py "C:\path\to\timetable-constraints.xlsx" --minutes 5` and press Enter. This does the same job without a window. |
| "this solution has N entries, but your current setup needs M" | The portal's sections changed after you downloaded the file. Download a fresh constraints file and solve again. |
| Result still shows clashes | Rooms are fewer than classes need (see Readiness Summary). The *Report* sheet names the classes affected. Add rooms / reduce sections, then repeat from Step 3. |
| `pip` can't download packages | You need internet for the very first run only (corporate proxies sometimes block it — try a different network). |

## Do I need to run the *portal* on my computer?
No. The portal stays online as normal. Only the solver runs on your computer, and your data never leaves it.
