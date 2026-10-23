import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { whereUsed } from "../../lib/courseHome";

export const dynamic = "force-dynamic";
export const metadata = { title: "Where my courses are used" };

export default async function WhereCoursesUsed({ searchParams }: { searchParams: { dept?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = await chairmanIdFor(user);
  const depts = await prisma.department.findMany({ where: { chairmanId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { departmentId: true } });
  const sel = depts.find((d) => d.id === searchParams.dept) || depts.find((d) => d.id === me?.departmentId) || depts[0];
  const d = sel ? await whereUsed(sel.id, chairmanId) : null;
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Where my department&apos;s courses are used</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Every course whose home is this department, and every program and batch that includes it — so you see which degrees depend on your faculty. See also <Link href="/courses-in-degree">courses in a degree by home department</Link>.</p>
      <form className="card" style={{ display: "flex", gap: 8 }}>
        <select name="dept" defaultValue={sel?.id}>{depts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <button className="btn btn-sm">Show</button>
        {sel && <a className="btn btn-secondary btn-sm" href={`/api/course-home?dept=${sel.id}`}>Download (Excel)</a>}
      </form>
      {d && (
        <>
          <div className="card"><b>{sel!.name}</b>: {d.courses.length} course(s); taught in {d.servedPrograms.length} other program(s){d.servedPrograms.length ? `: ${d.servedPrograms.join(", ")}` : ""}.</div>
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>Used in</th></tr></thead>
              <tbody>{d.courses.map((c) => (
                <tr key={c.code}><td style={{ whiteSpace: "nowrap" }}><b>{c.code}</b> {c.title}{c.otherPrograms.length > 0 && <div style={{ color: "#1565C0", fontSize: 11 }}>also in {c.otherPrograms.length} other program(s)</div>}</td>
                  <td className="small-note">{c.uses.map((u, i) => <div key={i} style={{ color: u.other ? "#1565C0" : undefined }}>{u.program} — {u.batch} · sem {u.semester ?? "—"}{u.offered ? ` · offered now: ${u.sections} section(s), ${u.students} students` : ""}</div>)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
