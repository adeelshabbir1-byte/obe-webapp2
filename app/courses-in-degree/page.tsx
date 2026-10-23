import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { visibleBatchIds } from "../../lib/studentScope";
import { coursesInDegree } from "../../lib/courseHome";

export const dynamic = "force-dynamic";
export const metadata = { title: "Courses in my degree" };

export default async function CoursesInDegree({ searchParams }: { searchParams: { batch?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const ids = await visibleBatchIds(user);
  const batches = await prisma.batch.findMany({ where: { id: { in: ids.concat("none") } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
  const sel = batches.find((b) => b.id === searchParams.batch) || batches[0];
  const d = sel ? await coursesInDegree(sel.id) : null;
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Courses in my degree — by home department</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Each course&apos;s <b>home</b> is the department whose subject it is (e.g. Mathematics for Calculus); that department&apos;s OMC reviews it and its teachers are suggested first in allocation. Set it on the <Link href="/coordinator/courses">Course Catalog</Link>. See also <Link href="/where-courses-used">where my department&apos;s courses are used</Link>.</p>
      <form className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select name="batch" defaultValue={sel?.id}>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select>
        <button className="btn btn-sm">Show</button>
        {sel && <a className="btn btn-secondary btn-sm" href={`/api/course-home?batch=${sel.id}`}>Download (Excel)</a>}
      </form>
      {d && (
        <>
          <div className="card"><b>{d.program} — {d.batch}</b>: {d.total} credit hours · {d.groups.map((g) => `${g.home}${g.set ? "" : " (not set)"} ${g.ch} CH (${d.total ? Math.round((100 * g.ch) / d.total) : 0}%)`).join(" · ")}
            {d.unset > 0 && <div style={{ color: "#B26A00", fontSize: 12.5, marginTop: 4 }}>{d.unset} course(s) have no home department set — they count as {d.ownDepartment}&apos;s.</div>}</div>
          {d.groups.map((g) => (
            <div key={g.home + g.set} className="card" style={{ overflowX: "auto", borderLeft: `5px solid ${g.set ? "#1565C0" : "#B26A00"}` }}>
              <h3 style={{ marginTop: 0 }}>{g.home}{g.set ? "" : " (home not set)"} <span className="small-note">{g.courses.length} course(s), {g.ch} CH</span></h3>
              <table style={{ fontSize: 12.5 }}><thead><tr><th>Sem</th><th>Course</th><th>Type</th><th>CH</th><th>Subject Expert</th><th>Teacher</th></tr></thead>
                <tbody>{g.courses.map((c) => <tr key={c.id}><td>{c.semesterNumber ?? "—"}</td><td><b>{c.code}</b> {c.title}</td><td>{c.courseType}</td><td>{c.creditHours}</td><td>{c.subjectExpert?.name || "—"}</td><td>{c.instructor?.name || "—"}</td></tr>)}</tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </Shell>
  );
}
