import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CourseFolderManager from "../../../components/CourseFolderManager";
import HowCalculated from "../../../components/HowCalculated";
import { navForRole } from "../../../components/reportNav";
import { reviewBatchWhere } from "../../../lib/reviewScope";
import { roleLabel } from "../../../lib/reportScope";
import { syncCourseFolders, PARTS } from "../../../lib/courseFile";

export const dynamic = "force-dynamic";

// Course files: each offered course's complete file (ten parts) as one PDF, whether it is complete, and every course of a
// batch or semester in one ZIP. "Kept" now follows completeness automatically.
export default async function CourseFoldersPage({ searchParams }: { searchParams: { batch?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const where = user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : await reviewBatchWhere(user);
  if (!where) redirect("/dashboard");
  const batches = await prisma.batch.findMany({ where, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
  const sel = batches.find((b) => b.id === searchParams.batch) || batches[0];
  const courses = sel ? await prisma.course.findMany({ where: { batchId: sel.id, isOffered: true }, select: { id: true, code: true, title: true, semesterNumber: true, coordinatorId: true, instructor: { select: { name: true } } }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] }) : [];
  const status = await syncCourseFolders(courses);
  const folders = await prisma.courseFolder.findMany({ where: { courseId: { in: courses.map((c) => c.id).concat(["none"]) } } });
  const by = new Map(folders.map((f) => [f.courseId, f]));
  const sems = Array.from(new Set(courses.map((c) => c.semesterNumber).filter((x): x is number => !!x))).sort((a, b) => a - b);
  const complete = courses.filter((c) => status.get(c.id)?.complete).length;
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course Files</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 10 }}>Each offered course&apos;s complete course file as one PDF, ready for the visiting team. A file is complete when all ten parts have something in them; the folder then counts as kept everywhere in OBEHUB.</p>
      <HowCalculated shows="The ten parts of a course file and when each counts as present.">
        <ul style={{ margin: "0 0 4px 18px", padding: 0 }}>
          {PARTS.map(([k, l]) => <li key={k}><b>{l}</b>: {{ outline: "a course description or textbook, or a lecture plan", clos: "CLOs written and every CLO mapped to a PLO", plan: "a lecture plan and at least one lecture recorded as taught", attendance: "attendance marked at least once", assessments: "assessments with a weight", samples: "marks entered (the best, middle and lowest scorer of each assessment are listed)", results: "marks entered", attainment: "marks entered against CLOs", cqi: "a CQI action recorded for the course, or the teacher's observations", feedback: "at least one student evaluation" }[k]}.</li>)}
        </ul>
      </HowCalculated>
      {!sel ? <div className="card">No batches.</div> : (
        <>
          <form className="card no-print" style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12 }}>Batch<br /><select name="batch" defaultValue={sel.id}>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select></label>
            <button className="btn btn-secondary btn-sm">Show</button>
            <span style={{ marginLeft: "auto", fontSize: 13 }}><b style={{ color: complete === courses.length && courses.length ? "#1E6B3A" : "#B3261E" }}>{complete}</b> of {courses.length} course files complete</span>
          </form>
          <div className="card no-print" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 13 }}>Download all as PDFs (ZIP):</b>
            {sems.map((s) => <a key={s} className="btn btn-secondary btn-sm" href={`/api/course-file?batch=${sel.id}&semester=${s}`}>Semester {s}</a>)}
            {courses.length <= 40 && <a className="btn btn-brass btn-sm" href={`/api/course-file?batch=${sel.id}&semester=all`}>Whole batch</a>}
          </div>
          <CourseFolderManager rows={courses.map((c) => { const s = status.get(c.id); return { id: c.id, code: c.code, title: c.title, batch: c.semesterNumber ? `Semester ${c.semesterNumber}` : "—", teacher: c.instructor?.name || "—", kept: !!s?.complete, done: s?.done.length || 0, missing: s?.missing || [], note: by.get(c.id)?.note || "" }; })} />
        </>
      )}
    </Shell>
  );
}
