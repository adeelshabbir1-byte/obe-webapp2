import { prisma } from "./db";
import { leadsInScope } from "./readinessScope";
import { share, worst, isReady, topLine, COLUMNS, type Cell, type ColKey } from "./semesterReadinessCore";

// Semester readiness board: one row per program (and per batch inside it) — set-up done, SE plans approved, instructors
// assigned, sections made, timetable done, registration open, the semester start — each cell green / amber / red with
// a count, every red cell linking to what is missing (the existing red flags: set-up progress, plan approval and the
// registration gate, sections of at most 50, the timetable).

export const BOARD_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR"];
type Who = { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null };
export type BatchRow = { batchId: string; label: string; cells: Record<ColKey, Cell>; ready: boolean };
export type ProgramRow = { leadId: string; program: string; department: string; term: string; start: Date | null; cells: Record<ColKey, Cell>; ready: boolean; batches: BatchRow[] };

export async function readinessBoard(user: Who, now = new Date()) {
  const leads = user.role === "PROGRAM_COORDINATOR"
    ? await prisma.user.findMany({ where: { id: user.id }, select: { id: true, name: true, leadProgram: true, departmentId: true, managedById: true, department_: { select: { name: true } } } })
    : (await leadsInScope(user)).leads;
  const { flowOf, stepHref } = await import("./batchFlow");
  const { registrationGate } = await import("./sePlan");
  const programs: ProgramRow[] = [];
  for (const lead of leads) {
    const term = await prisma.currentTerm.findUnique({ where: { coordinatorId: lead.id } });
    const termLabel = term ? `${term.termName} ${term.year}` : "This semester";
    const batches = await prisma.batch.findMany({ where: { coordinatorId: lead.id }, orderBy: [{ startYear: "desc" }, { startTerm: "asc" }], select: { id: true, batchName: true, degreeProgram: true, studentCount: true, registrationOpen: true, _count: { select: { students: true } } } });
    const progress = new Set(((await (prisma as unknown as Record<string, any>).batchSetupProgress?.findMany({ where: { batchId: { in: batches.map((b) => b.id) } }, select: { batchId: true } }).catch(() => [])) || []).map((p: { batchId: string }) => p.batchId));
    const rows: BatchRow[] = [];
    for (const b of batches) {
      const offered = await prisma.course.findMany({
        where: { batchId: b.id, isOffered: true, ...(term ? { offeredTermName: term.termName, offeredTermYear: term.year } : {}) },
        orderBy: { code: "asc" },
        select: { id: true, code: true, templateStatus: true, instructorId: true, scheduleSections: { select: { id: true, _count: { select: { timetableEntries: true } } } } },
      });
      if (!offered.length && b._count.students === 0 && !progress.has(b.id)) continue; // not running and not being set up
      const f = progress.has(b.id) ? await flowOf(b.id).catch(() => null) : null;
      const setup: Cell = !progress.has(b.id) ? { light: "green", text: "done" } : f && (f.approved || f.done >= f.steps.length) ? { light: "green", text: `${f.steps.length} of ${f.steps.length}` } : share(f?.done || 0, f?.steps.length || 13, stepHref(f?.current || 1, b.id), [`step ${f?.current || 1}`]);
      const notApproved = offered.filter((c) => c.templateStatus !== "approved");
      const plans = share(offered.length - notApproved.length, offered.length, notApproved[0] ? `/coordinator/batch-review?batchId=${b.id}&courseId=${notApproved[0].id}` : null, notApproved.map((c) => c.code));
      const noTeacher = offered.filter((c) => !c.instructorId);
      const instructors = share(offered.length - noTeacher.length, offered.length, `/coordinator/courses?batchId=${b.id}`, noTeacher.map((c) => c.code));
      const students = b._count.students || b.studentCount || 0;
      const sectioned = offered.filter((c) => c.scheduleSections.length > 0);
      const tooBig = sectioned.filter((c) => students / c.scheduleSections.length > 50);
      let sections = share(sectioned.length, offered.length, "/coordinator/timetable", offered.filter((c) => !c.scheduleSections.length).map((c) => c.code));
      if (sections.light === "green" && tooBig.length) sections = { light: "amber", text: `${tooBig.length} over 50`, href: "/coordinator/timetable", missing: tooBig.map((c) => c.code) };
      const allSecs = offered.flatMap((c) => c.scheduleSections);
      const timetable = share(allSecs.filter((s) => s._count.timetableEntries > 0).length, allSecs.length, "/coordinator/timetable");
      let registration: Cell = { light: "green", text: "open" };
      if (!b.registrationOpen && offered.length) {
        const g = await registrationGate(b.id).catch(() => null);
        registration = g && g.missing.length ? { light: "red", text: `closed — ${g.missing.length} plan${g.missing.length > 1 ? "s" : ""} not approved`, href: `/coordinator/batch-review?batchId=${b.id}`, missing: g.missing.map((m) => m.code) } : { light: "amber", text: "closed — ready to open", href: `/coordinator/batch-review?batchId=${b.id}` };
      } else if (!offered.length) registration = { light: "green", text: "—" };
      const cells = { setup, plans, instructors, sections, timetable, registration };
      rows.push({ batchId: b.id, label: `${b.degreeProgram} — ${b.batchName}`, cells, ready: isReady(cells) });
    }
    if (!rows.length) continue;
    const program = lead.leadProgram || rows[0].label.split(" — ")[0];
    const sd = term ? await prisma.semesterDates.findFirst({ where: { coordinatorId: lead.id, termName: term.termName, termYear: term.year }, select: { semesterStartDate: true } }).catch(() => null) : null;
    const cal = !sd?.semesterStartDate && term ? await prisma.academicCalendarEntry.findFirst({ where: { chairmanId: lead.managedById || "none", kind: "SEMESTER_START", termName: term.termName }, orderBy: { startDate: "desc" }, select: { startDate: true } }).catch(() => null) : null;
    const cells = Object.fromEntries(COLUMNS.map((c) => [c.key, worst(rows.map((r) => r.cells[c.key]))])) as Record<ColKey, Cell>;
    programs.push({ leadId: lead.id, program, department: lead.department_?.name || "", term: termLabel, start: sd?.semesterStartDate || cal?.startDate || null, cells, ready: isReady(cells), batches: rows });
  }
  const starts = programs.map((p) => p.start).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
  const term = programs[0]?.term || "This semester";
  return { programs, line: topLine(term, starts[0] || null, programs.filter((p) => p.ready).length, programs.length, now) };
}
