import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { EXTENSIONS } from "../../../lib/fyp";

export const dynamic = "force-dynamic";
export const metadata = { title: "FYP results" };
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "—");

// The Examination Department (the Institute Head's exam office): FYP results signed off by the department Chairmen,
// and the grade holds that extensions put on students who are still finishing.
export default async function FypExamsPage({ searchParams }: { searchParams: { cycle?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "CHAIRMAN") redirect("/fyp");
  let missing = false;
  const cycles = await prisma.fypCycle.findMany({ where: { chairmanId: user.id }, orderBy: { createdAt: "desc" } }).catch(() => { missing = true; return []; });
  const depts = new Map((await prisma.department.findMany({ where: { chairmanId: user.id }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
  const cycle = cycles.find((c) => c.id === searchParams.cycle) || null;
  const scope = cycle ? [cycle.id] : cycles.map((c) => c.id);
  const results = missing ? [] : await prisma.fypResult.findMany({ where: { cycleId: { in: scope.concat(["none"]) }, status: { in: ["APPROVED", "HELD"] } }, orderBy: [{ status: "asc" }, { submittedAt: "desc" }] });
  const groups = missing ? [] : await prisma.fypGroup.findMany({ where: { cycleId: { in: scope.concat(["none"]) } } });
  const extensions = missing ? [] : await prisma.fypExtension.findMany({ where: { groupId: { in: groups.map((g) => g.id).concat(["none"]) } }, orderBy: { createdAt: "desc" } });
  const students = new Map((await prisma.student.findMany({ where: { id: { in: results.map((r) => r.studentId).concat(["none"]) } }, select: { id: true, name: true, rollNumber: true } })).map((s) => [s.id, s]));
  const people = new Map((await prisma.user.findMany({ where: { id: { in: results.map((r) => r.approvedById).filter((x): x is string => !!x).concat(["none"]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const cycleOf = new Map(cycles.map((c) => [c.id, c]));
  const groupOf = new Map(groups.map((g) => [g.id, g]));
  const approved = results.filter((r) => r.status === "APPROVED"), held = results.filter((r) => r.status === "HELD");
  // Students whose group has a running extension but whose result is not consolidated yet are on hold too.
  const extendedGroups = groups.filter((g) => g.extendedUntil && g.status !== "COMPLETED");

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>FYP results — Examination Department</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12, maxWidth: 920 }}>
        Final Year Project results arrive here once the department Chairman signs them off; they are already posted to the students&apos; transcripts. Groups on an extension are listed as grade holds.
      </p>
      {missing && <div className="err">Final Year Projects are not set up in the database yet — run prisma/migration_fyp.sql in Supabase.</div>}
      {cycles.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0" }}>
          <Link href="/fyp/exams" className={`btn btn-sm ${!cycle ? "btn-brass" : "btn-secondary"}`}>All cycles</Link>
          {cycles.map((c) => <Link key={c.id} href={`/fyp/exams?cycle=${c.id}`} className={`btn btn-sm ${c.id === cycle?.id ? "btn-brass" : "btn-secondary"}`}>{c.title} · {depts.get(c.departmentId)}</Link>)}
        </div>
      )}

      <div className="card" style={{ borderLeft: held.length || extendedGroups.length ? "4px solid var(--rust)" : undefined }}>
        <h3 style={{ marginTop: 0 }}>Grade holds ({extendedGroups.length} group(s))</h3>
        {extendedGroups.length === 0 ? <p className="small-note">No FYP group is on an extension.</p> : (
          <table>
            <thead><tr><th>Department · cycle</th><th>Group</th><th>Extended to</th><th>Follow-up panel</th><th>Reason</th></tr></thead>
            <tbody>{extendedGroups.map((g) => {
              const e = extensions.find((x) => x.groupId === g.id);
              const c = cycleOf.get(g.cycleId);
              return <tr key={g.id}><td>{depts.get(c?.departmentId || "")}<div className="small-note">{c?.title}</div></td><td>{g.name}</td><td>{day(g.extendedUntil)}{e && <div className="small-note">{EXTENSIONS[e.kind]?.label}</div>}</td><td>{day(e?.followUpAt)}</td><td className="small-note">{e?.reason || "—"}</td></tr>;
            })}</tbody>
          </table>
        )}
        {held.length > 0 && <p className="small-note" style={{ marginBottom: 0 }}>{held.length} student result(s) are recorded as &ldquo;I&rdquo; (incomplete) until the follow-up evaluation.</p>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Approved results ({approved.length})</h3>
        {approved.length === 0 ? <p className="small-note">Nothing submitted yet.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Student</th><th>Department · cycle</th><th>Group</th><th>Course</th><th>Total</th><th>Grade</th><th>GPA points</th><th>Signed off</th></tr></thead>
              <tbody>{approved.map((r) => {
                const s = students.get(r.studentId), c = cycleOf.get(r.cycleId);
                return (
                  <tr key={r.id}>
                    <td>{s?.name}<div className="small-note">{s?.rollNumber}</div></td>
                    <td>{depts.get(c?.departmentId || "")}<div className="small-note">{c?.title}</div></td>
                    <td>{groupOf.get(r.groupId)?.name}</td>
                    <td className="small-note">{c?.courseCode} {c?.courseTitle} · {c?.creditHours} cr · {c?.termName} {c?.termYear}</td>
                    <td>{Math.round(r.totalPct * 10) / 10}%</td><td><b>{r.grade}</b></td><td>{r.gpaPoints ?? "—"}</td>
                    <td className="small-note">{day(r.submittedAt)}{r.approvedById ? ` by ${people.get(r.approvedById)}` : ""}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
