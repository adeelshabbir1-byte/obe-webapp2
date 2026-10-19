import { prisma } from "./db";
import { MIGRATIONS } from "./migrationProbes";

// What a new institute still has to set up, and a quick run of the main modules on its own data (each one timed, with
// the error if it fails) — the same check to run after every release.

export type Check = { area: string; label: string; ok: boolean; detail: string; href?: string };

export async function setupChecks(chairmanId: string): Promise<Check[]> {
  const out: Check[] = [];
  const add = (area: string, label: string, ok: boolean, detail: string, href?: string) => out.push({ area, label, ok, detail, href });
  const rows = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`).catch(() => []);
  const cols = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`)), tables = new Set(rows.map((r) => r.table_name));
  const missing = MIGRATIONS.filter((m) => !(m.c ? cols.has(`${m.t}.${m.c}`) : tables.has(m.t)));
  add("Database", "All database updates run", !missing.length, missing.length ? `${missing.length} to run: ${missing.slice(0, 6).map((m) => m.f).join(", ")}${missing.length > 6 ? "…" : ""}` : "all in place", "/admin/migrations");

  const [depts, programs, leads] = await Promise.all([
    prisma.department.count({ where: { chairmanId } }),
    prisma.departmentProgram.findMany({ where: { chairmanId }, select: { degreeProgram: true, accreditationBody: true } }).catch(() => []),
    prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true, name: true, leadProgram: true } }),
  ]);
  add("Structure", "Departments", depts > 0, `${depts}`, "/chairman/departments");
  add("Structure", "Programs bound to their council", programs.length > 0 && programs.every((p) => !!p.accreditationBody), programs.length ? `${programs.filter((p) => p.accreditationBody).length} of ${programs.length} bound` : "no program registered", "/accreditation/readiness/programs");
  add("Structure", "Program Leads", leads.length > 0, `${leads.length}`, "/chairman/departments");
  const ids = leads.map((l) => l.id).concat(["none"]);
  const [terms, scales, batches, offered, advisors] = await Promise.all([
    prisma.currentTerm.findMany({ where: { coordinatorId: { in: ids } }, select: { coordinatorId: true } }),
    prisma.gradingScale.groupBy({ by: ["coordinatorId"], where: { coordinatorId: { in: ids } } }).catch(() => []),
    prisma.batch.findMany({ where: { coordinatorId: { in: ids } }, select: { id: true, batchName: true, degreeProgram: true, advisorId: true, students: { where: { status: "ACTIVE" }, select: { id: true }, take: 1 } } }),
    prisma.course.count({ where: { coordinatorId: { in: ids }, isOffered: true } }),
    Promise.resolve(0),
  ]);
  void advisors;
  const noTerm = leads.filter((l) => !terms.some((t) => t.coordinatorId === l.id));
  add("Each program", "Current term set", !noTerm.length, noTerm.length ? `missing for ${noTerm.map((l) => l.leadProgram || l.name).join(", ")}` : "set for every program");
  const noScale = leads.filter((l) => !scales.some((s) => s.coordinatorId === l.id));
  add("Each program", "Grading scale", !noScale.length, noScale.length ? `missing for ${noScale.map((l) => l.leadProgram || l.name).join(", ")}` : "defined");
  const live = batches.filter((b) => b.students.length);
  add("Each program", "Batches with students", live.length > 0, `${live.length} of ${batches.length} batches have students`, "/coordinator/students");
  const noAdvisor = live.filter((b) => !b.advisorId);
  add("Each program", "Advisor for every batch", !noAdvisor.length, noAdvisor.length ? `no advisor: ${noAdvisor.slice(0, 6).map((b) => `${b.degreeProgram} ${b.batchName}`).join(", ")}` : "all assigned");
  const gaBatches = new Set((await prisma.pLO.findMany({ where: { batchId: { in: live.map((b) => b.id).concat(["none"]) } }, select: { batchId: true }, distinct: ["batchId"] })).map((p) => p.batchId));
  const noGa = live.filter((b) => !gaBatches.has(b.id));
  add("Outcomes", "Graduate Attributes for every batch", !noGa.length, noGa.length ? `no GAs: ${noGa.slice(0, 6).map((b) => `${b.degreeProgram} ${b.batchName}`).join(", ")}` : "all batches", "/ga-council-map");
  add("Teaching", "Courses offered this term", offered > 0, `${offered}`);
  const unassigned = await prisma.course.count({ where: { coordinatorId: { in: ids }, isOffered: true, instructorId: null, sectionAssignments: { none: {} } } });
  add("Teaching", "Every offered course has a teacher", unassigned === 0, unassigned ? `${unassigned} without a teacher` : "all assigned", "/assigner/matrix");
  const tt = await prisma.timetableRun.count({ where: { chairmanId, status: "COMPLETED" } });
  add("Teaching", "Timetable generated", tt > 0, tt ? "yes" : "no completed timetable");
  return out;
}

/** Run the main computations on this institute's own data; report time and any error. */
export async function moduleSmoke(chairmanId: string) {
  const res: { module: string; ok: boolean; ms: number; detail: string }[] = [];
  const run = async (module: string, f: () => Promise<string>) => {
    const t = Date.now();
    try { res.push({ module, ok: true, ms: Date.now() - t, detail: await f() }); } catch (e) { res.push({ module, ok: false, ms: Date.now() - t, detail: String((e as Error).message || e).slice(0, 300) }); }
    res[res.length - 1].ms = Date.now() - t;
  };
  const leads = (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } })).map((u) => u.id).concat(["none"]);
  const course = await prisma.course.findFirst({ where: { coordinatorId: { in: leads }, isOffered: true, studentEnrollments: { some: {} } }, select: { id: true, code: true } });
  const student = await prisma.student.findFirst({ where: { status: "ACTIVE", batch: { coordinatorId: { in: leads } } }, select: { id: true, rollNumber: true } });
  await run("Results (result sheet)", async () => { if (!course) return "no offered course with students"; const { computeResultMate } = await import("./resultMate"); const r = await computeResultMate(course.id); return `${course.code}: ${r.rows.length} students, mean ${r.stats.mean}%`; });
  await run("Attendance", async () => { if (!course) return "no course"; const { courseAttendance, attendancePolicy } = await import("./attendance"); const r = await courseAttendance(course.id, await attendancePolicy(chairmanId)); return `${r.held} classes held, average ${r.average ?? "—"}%`; });
  await run("Degree plan", async () => { if (!student) return "no student"; const { loadScheme } = await import("./degreeScheme"); const s = await loadScheme(student.id); return `${student.rollNumber}: ${s?.planned.length ?? 0} courses to plan`; });
  await run("Degree planner", async () => { if (!student) return "no student"; const { loadPlanInput, planDegree } = await import("./degreePlanner"); const i = await loadPlanInput(student.id); if (!i) return "no input"; const p = planDegree(i); return `finishes ${p.finishLabel || "—"}${p.unplaced.length ? `, ${p.unplaced.length} unplaced` : ""}`; });
  await run("Advisor course status", async () => { if (!student) return "no student"; const { liveCourseStatus } = await import("./studentCourseStatus"); return `${(await liveCourseStatus(student.id)).length} courses`; });
  await run("Early warning", async () => { const { earlyWarning } = await import("./earlyWarning"); const r = await earlyWarning(chairmanId, { limit: 50 }); return `${r.filter((x) => x.level === "HIGH").length} high risk of ${r.length} checked`; });
  await run("Council eligibility", async () => { const { eligibility } = await import("./councilEligibility"); return `${(await eligibility(chairmanId)).length} program(s) checked`; });
  await run("Assessment rules", async () => { const { breachesFor } = await import("./assessmentRules"); return `${(await breachesFor(leads)).length} course plan(s) outside the rules`; });
  await run("Course allocation", async () => { const assigner = await prisma.user.findFirst({ where: { role: "COURSE_ASSIGNER", managedById: chairmanId }, select: { id: true, role: true, managedById: true, departmentId: true } }); if (!assigner) return "no Course Assigner"; const { suggestAllocation } = await import("./autoAllocate"); const s = await suggestAllocation(assigner, { keepExisting: true }); return `${s.proposals.length} suggestion line(s)`; });
  return res;
}
