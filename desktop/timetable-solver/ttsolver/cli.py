"""Command line: solve or check without the window.

  ttsolver solve timetable-constraints.xlsx timetable-solution.xlsx [--time 120] [--workers N] [--pdf out.pdf]
  ttsolver check timetable-constraints.xlsx timetable-solution.xlsx
"""
from __future__ import annotations

import argparse
import sys

from .checker import check
from .io_xlsx import assignment_from_solution, read_constraints, read_solution, write_solution
from .solver import Settings, Solver, summarize_violations


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):  # Windows consoles: print "—" and "×" instead of failing on them
        if stream is not None and hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(prog="ttsolver", description="OBEHUB timetable solver")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("solve", help="make a clash-free timetable")
    s.add_argument("constraints")
    s.add_argument("solution")
    s.add_argument("--time", type=float, default=120)
    s.add_argument("--workers", type=int, default=0)
    s.add_argument("--pdf")
    c = sub.add_parser("check", help="check a solution file against the hard rules")
    c.add_argument("constraints")
    c.add_argument("solution")
    a = ap.parse_args(argv)

    loaded = read_constraints(a.constraints)
    if loaded.problem is None:
        print("The constraints file has problems:", *loaded.errors, sep="\n  ")
        return 2
    p = loaded.problem
    if a.cmd == "check":
        rows, summary = read_solution(a.solution)
        v = check(p, assignment_from_solution(rows))
        print(f"{len(rows)} rows for {len(p.slots)} sessions · {len(v)} hard violation(s) (the file's Summary says {summary['hardViolations']:g})")
        print(*summarize_violations(v), sep="\n")
        return 0 if not v and len(rows) == len(p.slots) else 1

    st = Settings(time_limit=a.time)
    if a.workers:
        st.workers = a.workers
    last = {"t": -1.0, "msg": ""}

    def show(x) -> None:  # at most one "better timetable" line a second
        if x.message == last["msg"] and x.elapsed - last["t"] < 1:
            return
        last.update(t=x.elapsed, msg=x.message)
        print(f"  {x.elapsed:6.1f}s  {x.message}" + (f"  score {x.objective:.0f}" if x.objective is not None else ""), flush=True)

    res = Solver(p, st).solve(on_progress=show)
    if not res.ok:
        print("No clash-free timetable:", *res.reasons, sep="\n  ")
        if res.relaxed_violations:
            print("To fit everything in, these rules would have to break:", *summarize_violations(res.relaxed_violations), sep="\n")
        return 1
    write_solution(a.solution, p, res.assignment, hard_violations=0, branches=res.branches, score=res.objective)
    if a.pdf:
        from .report import write_pdf
        write_pdf(a.pdf, p, res.assignment)
    print(f"Saved {a.solution}: {len(p.slots)} sessions, 0 hard violations, score {res.objective:.0f} ({res.status.lower()}, {res.elapsed:.0f} s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
