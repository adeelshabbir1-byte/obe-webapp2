import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../lib/db";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import { dropEffect, type WCourse } from "../../lib/curriculumWhatIfCore";

export const dynamic = "force-dynamic";
export const metadata = { title: "Curriculum what-if" };
const ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "OMC", "DEPARTMENT_COORDINATOR"];

// Before a curriculum change goes to the BOS: tick the courses to drop and see credit totals, how many courses still
// build each graduate attribute, and the courses that need a dropped one first. Nothing is changed.
export default async function CurriculumWhatIf({ searchParams }: { searchParams: { batchId?: string; drop?: string | string[] } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!ROLES.includes(user.role)) redirect("/home");
  const cid = await chairmanIdFor(user as never);
  const batches = await prisma.batch.findMany({ where: user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : { coordinator: { managedById: cid } }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }], select: { id: true, degreeProgram: true, batchName: true } });
  const batch = batches.find((b) => b.id === searchParams.batchId) || batches[0];
  const shell = (body: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{body}</Shell>;
  if (!batch) return shell(<><h1>Curriculum what-if</h1><div className="card"><p>No batch yet.</p></div></>);
  const [cs, plos] = await Promise.all([
    prisma.course.findMany({ where: { batchId: batch.id }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }], select: { id: true, code: true, title: true, creditHours: true, semesterNumber: true, prerequisiteCourseId: true, ploMappings: { select: { plo: { select: { number: true } } } } } }),
    prisma.pLO.findMany({ where: { batchId: batch.id }, orderBy: { number: "asc" }, select: { number: true, title: true } }),
  ]);
  const courses: WCourse[] = cs.map((c) => ({ id: c.id, code: c.code, title: c.title, credits: c.creditHours || 0, semester: c.semesterNumber, gas: c.ploMappings.map((m) => m.plo.number), prereqId: c.prerequisiteCourseId }));
  const drop = new Set(([] as string[]).concat(searchParams.drop || []).filter((id) => courses.some((c) => c.id === id)));
  const r = dropEffect(courses, drop, plos);
  return shell(<>
    <h1>Curriculum what-if</h1>
    <p className="small-note">Tick the courses you plan to drop or replace, then press Show. Nothing is changed. Take the result to the OMC and the BOS with the <Link href="/curriculum-changes">curriculum change</Link>.</p>
    <form method="get" className="card" style={{ fontSize: 13 }}>
      <label>Batch <select name="batchId" defaultValue={batch.id}>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select></label>
      <div style={{ columns: "2 300px", marginTop: 8 }}>{courses.map((c) => <label key={c.id} style={{ display: "block", breakInside: "avoid" }}><input type="checkbox" name="drop" value={c.id} defaultChecked={drop.has(c.id)} /> S{c.semester ?? "?"} · <b>{c.code}</b> {c.title} ({c.credits} CH)</label>)}</div>
      <button className="btn" style={{ marginTop: 8 }}>Show</button>
    </form>
    {drop.size > 0 && <div className="card" data-whatif-result>
      <p><b>Dropping:</b> {r.dropped.join(", ")}</p>
      <p>Credit hours: {r.creditsBefore} → <b>{r.creditsAfter}</b> ({r.creditsAfter - r.creditsBefore})</p>
      {r.dependents.length > 0 && <p style={{ color: "#B3261E" }}><b>Needs a dropped course first:</b> {r.dependents.map((d) => `${d.code} ${d.title} (needs ${d.needs})`).join("; ")}</p>}
      <table style={{ fontSize: 13 }}><thead><tr><th>GA</th><th>Attribute</th><th>Courses building it now</th><th>After the change</th><th /></tr></thead>
        <tbody>{r.gaRows.map((g) => <tr key={g.number}><td>GA-{g.number}</td><td>{g.title}</td><td>{g.before}</td><td><b>{g.after}</b></td><td style={{ color: g.risk ? "#B3261E" : undefined }}>{g.risk}</td></tr>)}</tbody></table>
    </div>}
  </>);
}
