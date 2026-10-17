import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { reviewBatchWhere } from "../../lib/reviewScope";
import { evalSummary } from "../../lib/evaluations";

export const dynamic = "force-dynamic";

// Course and teacher evaluations by students, per course, for the Program Lead, Chairman and Institute Head.
export default async function EvaluationsPage({ searchParams }: { searchParams: { batch?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const where = await reviewBatchWhere(user);
  if (!where) redirect("/dashboard");
  const batches = await prisma.batch.findMany({ where, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
  const sel = batches.find((b) => b.id === searchParams.batch);
  const courses = await prisma.course.findMany({ where: { batch: sel ? { id: sel.id } : where }, select: { id: true, code: true, title: true, instructor: { select: { name: true } }, batch: { select: { batchName: true } }, _count: { select: { studentEnrollments: true } } }, orderBy: { code: "asc" }, take: 400 });
  const ev = await evalSummary(courses.map((c) => c.id));
  const col = (v: number | null) => (v === null ? undefined : v < 3 ? "#B3261E" : v < 3.5 ? "#A35A00" : "#1F5E36");
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course &amp; Teacher Evaluations</h1>
      <p className="small-note">Students rate each course and its teacher at the end of the course (Course Surveys in their portal). Averages out of 5; red below 3, amber below 3.5.</p>
      <form className="card" style={{ display: "flex", gap: 8 }}><select name="batch" defaultValue={sel?.id || ""}><option value="">All batches</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select><button className="btn btn-secondary btn-sm">Show</button></form>
      <div className="card" style={{ overflowX: "auto" }}><table><thead><tr><th>Course</th><th>Teacher</th><th>Response rate</th><th>Course</th><th>Teacher</th><th>Comments</th></tr></thead>
        <tbody>{courses.map((c) => { const e = ev.get(c.id)!; const n = Math.max(e.COURSE.n, e.TEACHER.n); return (
          <tr key={c.id}><td>{c.code} <span className="small-note">{c.title} · {c.batch?.batchName}</span></td><td>{c.instructor?.name || "—"}</td><td>{c._count.studentEnrollments ? `${Math.round((100 * n) / c._count.studentEnrollments)}%` : "—"}</td>
            <td style={{ color: col(e.COURSE.overall), fontWeight: 700 }}>{e.COURSE.overall ?? "—"}</td><td style={{ color: col(e.TEACHER.overall), fontWeight: 700 }}>{e.TEACHER.overall ?? "—"}</td><td style={{ fontSize: 12, maxWidth: 320 }}>{[...e.COURSE.comments, ...e.TEACHER.comments].slice(0, 3).join(" | ")}</td></tr>); })}</tbody></table></div>
    </Shell>
  );
}
