import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { courseTypeColor } from "../../../lib/courseTypeColors";
import { coordinatorIdsFor, roleLabel } from "../../../lib/reportScope";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import InstructorAssignCell from "../../../components/InstructorAssignCell";


export default async function ProgramSemesterMapPage({ searchParams }: { searchParams: { degree?: string; term?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!["PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "OMC", "CHAIRMAN"].includes(user.role)) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const degrees = Array.from(new Set(allBatches.map((b) => b.degreeProgram)));
  const selectedDegree = searchParams.degree || degrees[0] || "";
  const batchesForDegree = allBatches.filter((b) => b.degreeProgram === selectedDegree);
  const batchIds = batchesForDegree.map((b) => b.id);

  // Every batch offers its own courses in its own term, so without a
  // term filter here a batch's Fall offering and a different batch's
  // Spring offering both land in the same "semester N" row at once,
  // wrongly implying they're both running right now. Available terms
  // are scoped to this specific program, not the Coordinator's whole
  // portfolio, since a term one program is running may not be one
  // another program is.
  const termRows = batchIds.length > 0
    ? await prisma.course.findMany({ where: { batchId: { in: batchIds }, offeredTermName: { not: null }, offeredTermYear: { not: null } }, distinct: ["offeredTermName", "offeredTermYear"], select: { offeredTermName: true, offeredTermYear: true } })
    : [];
  const availableTerms = termRows.map((r) => ({ termName: r.offeredTermName!, year: r.offeredTermYear! }))
    .sort((a, b) => (b.year - a.year) || a.termName.localeCompare(b.termName));
  function termKey(t: { termName: string; year: number }) { return `${t.termName}-${t.year}`; }
  // Default to "All Terms", not the single most-recent labeled term. A lot
  // of currently-offered courses were never stamped with offeredTermName
  // (offered before that field existed, or via the manual per-course
  // toggle) — filtering to one specific term by default silently hides
  // every one of those, even though they're correctly marked offered.
  // "All Terms" has no such filter, so nothing with a missing label gets
  // dropped just because the page loaded without a ?term= in the URL.
  const selectedTermKey = searchParams.term ?? "all";
  const showAllTerms = selectedTermKey === "all";
  const selectedTerm = showAllTerms ? null : availableTerms.find((t) => termKey(t) === selectedTermKey) || null;

  // Every currently-offered course across every one of this program's
  // batches, overlaid by semester — so semester 5 shows every active
  // batch's own semester 5 side by side. "All Terms" shows every batch
  // regardless of which term each one is actually running in (each
  // course's own term is labeled on its card, since a freshman batch's
  // Semester 1 was likely last marked offered back when it started,
  // not in whatever term is currently selected) — picking one specific
  // term instead narrows to only courses genuinely running in that term,
  // for when Spring and Fall offerings need to be told apart cleanly.
  const currentTerm = await prisma.currentTerm.findUnique({ where: { coordinatorId: user.id }, select: { termName: true, year: true } });
  // Offered courses that never got a term label are running now: stamp them with the current term once, so every page agrees.
  if (currentTerm) await prisma.course.updateMany({ where: { coordinatorId: user.id, isOffered: true, offeredTermName: null }, data: { offeredTermName: currentTerm.termName, offeredTermYear: currentTerm.year } });
  const courses = batchIds.length > 0 && (showAllTerms || selectedTerm)
    ? await prisma.course.findMany({
        where: {
          batchId: { in: batchIds }, isOffered: true,
          // Courses offered before the term label existed have no label. They are running now, so they belong to the current term.
          ...(selectedTerm ? (currentTerm && currentTerm.termName === selectedTerm.termName && currentTerm.year === selectedTerm.year
            ? { OR: [{ offeredTermName: selectedTerm.termName, offeredTermYear: selectedTerm.year }, { offeredTermName: null }] }
            : { offeredTermName: selectedTerm.termName, offeredTermYear: selectedTerm.year }) : {}),
        },
        include: { batch: true, instructor: true },
        orderBy: [{ semesterNumber: "asc" }, { batchId: "asc" }, { code: "asc" }],
      })
    : [];

  // Institute Head/Coordinator/OMC can assign an instructor right from this map
  // — Subject Expert still only views it, same as the assign-instructor
  // API route itself only accepts those three roles (plus Course Assigner,
  // who doesn't view this page at all).
  const canAssign = ["PROGRAM_COORDINATOR", "OMC", "CHAIRMAN"].includes(user.role);

  const maxSemester = courses.length > 0 ? Math.max(8, ...courses.map((c) => c.semesterNumber || 1)) : 8;
  const bySemester: Record<number, typeof courses> = {};
  for (const c of courses) {
    const sem = c.semesterNumber || 1;
    bySemester[sem] = [...(bySemester[sem] || []), c];
  }

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Program Semester Map</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Every currently-offered course across all of a program's batches, one row per semester, with who's
        teaching it and which batch it belongs to. Default is "All Terms" so every active batch shows up
        regardless of which term it's actually in (each course's own term is labeled) — pick one specific
        term instead to see only what's genuinely running then, useful for keeping Spring and Fall apart.
        {canAssign
          ? " Click a course's instructor line to assign or change who's teaching it."
          : " Read-only — this is a report, not an editor."}
      </p>

      <div className="card">
        <form method="GET" style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Degree Program</label>
            <select name="degree" defaultValue={selectedDegree} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              {degrees.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Term</label>
            <select name="term" defaultValue={selectedTermKey} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              <option value="all">All Terms</option>
              {availableTerms.map((t) => <option key={termKey(t)} value={termKey(t)}>{t.termName} {t.year}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-brass">Show Map</button>
        </form>
      </div>

      {courses.length === 0 && (
        <div className="card"><p style={{ fontSize: 12.5, color: "var(--slate)" }}>No offered courses found for this program in this term.</p></div>
      )}

      {Array.from({ length: maxSemester }, (_, i) => i + 1).map((sem) => {
        const semCourses = bySemester[sem] || [];
        if (semCourses.length === 0) return null;
        return (
          <div key={sem} className="card">
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Semester {sem}</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {semCourses.map((c) => (
                <div key={c.id} style={{ minWidth: 200, maxWidth: 240, border: "1px solid var(--line)", borderLeft: `4px solid ${courseTypeColor(c.courseType, c.code)}`, padding: "8px 10px", borderRadius: 3 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.code} — {c.title}</div>
                  <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 4 }}>{c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—"}</div>
                  {c.offeredTermName && <div style={{ fontSize: 10.5, color: "var(--slate)" }}>{c.offeredTermName} {c.offeredTermYear}</div>}
                  <InstructorAssignCell
                    courseId={c.id}
                    initialInstructorId={c.instructorId}
                    initialInstructorName={c.instructor?.name ?? null}
                    canAssign={canAssign}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </Shell>
  );
}
