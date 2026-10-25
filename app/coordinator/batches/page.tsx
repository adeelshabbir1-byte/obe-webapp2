import { advisorCandidatesWhere } from "../../../lib/advisors";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import BatchesManager from "../../../components/BatchesManager";
import DegreeProgramsAndIntakeManager from "../../../components/DegreeProgramsAndIntakeManager";
import { navForRole } from "../../../components/reportNav";
import { ActionForm } from "../../../components/fyp/FypClient";
import { obeStarts, termLabel } from "../../../lib/obeTerm";
import { LIST_TYPES as LIST_TYPES_ } from "../../../lib/autoCopyPreviousBatch";


export default async function BatchesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const batches = await prisma.batch.findMany({
    where: { coordinatorId: user.id },
    orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }],
    include: { _count: { select: { courses: true, students: true } } },
  });
  // Older imports: give elective / IDS list options their list type so they never add to the totals.
  { const { retypeListCourses } = await import("../../../lib/listCourses"); for (const b of batches) if (b._count.courses > 0) await retypeListCourses(b.id).catch(() => 0); }
  // Credit hours per batch and semester (non-credit deficiency courses don't count).
  const crRows = await prisma.course.groupBy({ by: ["batchId", "semesterNumber"], where: { batchId: { in: batches.map((b) => b.id) }, isNonCredit: false, courseType: { notIn: LIST_TYPES_ } }, _sum: { creditHours: true } });
  const creditsOf = (batchId: string) => {
    const rows = crRows.filter((r) => r.batchId === batchId);
    return { total: rows.reduce((n, r) => n + (r._sum.creditHours || 0), 0), bySemester: rows.filter((r) => r.semesterNumber).sort((a, b) => (a.semesterNumber || 0) - (b.semesterNumber || 0)).map((r) => ({ sem: r.semesterNumber as number, cr: r._sum.creditHours || 0 })) };
  };
  const degreePrograms = await prisma.degreeProgram.findMany({ where: { coordinatorId: user.id }, orderBy: { name: "asc" } });
  const obe = await obeStarts(user.managedById || "none");
  const obeProgs = Array.from(new Set([...degreePrograms.map((d) => d.name), ...batches.map((b) => b.degreeProgram)])).sort();
  // Any teacher can advise a batch: the people this Program Lead manages, the Lead themself, and teachers of the same
  // department (Chairman, other Program Leads, Instructors) — not only plain Instructors / Subject Experts.
  const facultyRaw = await prisma.user.findMany({ where: advisorCandidatesWhere(user), orderBy: { name: "asc" }, select: { id: true, name: true, managedById: true, departmentId: true, role: true, department_: { select: { name: true } }, advisedBatches: { select: { id: true, degreeProgram: true, batchName: true } } } });
  const sections = await prisma.course.groupBy({ by: ["instructorId"], where: { isOffered: true, instructorId: { in: facultyRaw.map((f) => f.id) } }, _count: { _all: true } });
  const secOf = new Map(sections.map((x) => [x.instructorId, x._count._all]));
  // Order for the advisor picker: own program's free teachers → own program → same department → other programs' free teachers → the rest.
  const rank = (f: (typeof facultyRaw)[number]) => { const own = f.managedById === user.id || f.id === user.id, dept = !!user.departmentId && f.departmentId === user.departmentId, free = !f.advisedBatches.length; return own && free ? 0 : own ? 1 : dept && free ? 2 : free ? 3 : dept ? 4 : 5; };
  const faculty = facultyRaw.map((f) => ({ ...f, rank: rank(f) })).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Batches</h1>
        <span style={{ display: "flex", gap: 8 }}><a href="/coordinator/batches/new" className="btn" style={{ textDecoration: "none" }}>+ New batch (step by step)</a><a href="/api/coordinator/batches/export" className="btn btn-brass" style={{ textDecoration: "none" }}>Export to Excel</a></span>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        The batches (intakes) of your program. Add a batch, then choose where its courses come from; set its advisor and planned intake. Each batch can follow a different curriculum version.
      </p>
      <DegreeProgramsAndIntakeManager programs={degreePrograms} />
      {obeProgs.length > 0 && <div className="card">
        <h3 style={{ marginTop: 0 }}>OBE start of your program</h3>
        <p className="small-note" style={{ marginTop: 0 }}>Courses taught from this term on are OBE; earlier ones are grades only (no CLOs needed, not in attainment). Institute: <b>{obe.institute ? termLabel(obe.institute) : "not set (all OBE)"}</b>. Leave the year empty to follow the institute.</p>
        {obeProgs.map((name) => { const own = obe.programs.find((p) => p.program === name); return (
          <div key={name} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}><b style={{ minWidth: 200 }}>{name}</b><span className="small-note" style={{ margin: 0 }}>{own ? `from ${termLabel(own)} (set by ${own.byName})` : "follows the institute"}</span>
            <ActionForm url="/api/obe-start" fixed={{ scope: "program", program: name }} submit="Save" collapsed openLabel="Change" showMessage initial={{ termName: own?.termName || "Fall", termYear: own?.termYear || "" }}
              fields={[{ name: "termName", label: "Term", type: "select", options: [["Fall", "Fall"], ["Spring", "Spring"]] }, { name: "termYear", label: "Year", type: "number", width: 100 }]} /></div>); })}
      </div>}
      <BatchesManager
        initialBatches={batches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName, startTerm: b.startTerm, startYear: b.startYear, studentCount: b.studentCount, enrolledCount: b._count.students, courseCount: b._count.courses, credits: creditsOf(b.id), registrationOpen: b.registrationOpen, advisorId: b.advisorId }))}
        faculty={faculty.map((f) => ({ id: f.id, name: f.name, group: ["Your program — not advising any batch", "Your program", "Your department — free", "Other programs — free", "Your department — already advising", "Others — already advising"][f.rank], dept: f.department_?.name || null, advising: f.advisedBatches.map((b) => `${b.degreeProgram} ${b.batchName}`), sections: secOf.get(f.id) || 0 }))}
      />
    </Shell>
  );
}
