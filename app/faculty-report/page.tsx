import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import { REPORT_VIEWER_ROLES, completeness, reportPeople, yearsOfService } from "../../lib/facultyProfile";

const LABEL: Record<string, string> = { HEAD_OF_DEPARTMENT: "Chairman", DEAN: "Dean", PROGRAM_COORDINATOR: "Program Lead", DEPARTMENT_COORDINATOR: "Program Coordinator", CHAIRMAN: "Institute Head" };
const colour = (p: number) => (p >= 80 ? "#2E7D4F" : p >= 50 ? "#C58A12" : "#B3261E");

export default async function FacultyReportPage({ searchParams }: { searchParams: { dept?: string; designation?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!REPORT_VIEWER_ROLES.includes(user.role)) redirect("/dashboard");

  const people = await reportPeople(user);
  const ids = people.map((p) => p.id);
  const [profiles, records] = await Promise.all([
    prisma.facultyProfile.findMany({ where: { userId: { in: ids.length ? ids : ["none"] } }, select: { userId: true, photo: true, designation: true, dateOfJoining: true, bloodGroup: true, phone: true, nextOfKinName: true, nextOfKinPhone: true, employmentType: true } }),
    prisma.facultyRecord.findMany({ where: { userId: { in: ids.length ? ids : ["none"] } }, select: { userId: true, kind: true, title: true, startYear: true } }),
  ]);
  const prof = new Map(profiles.map((p) => [p.userId, p]));
  const rows = people.map((p) => {
    const pr = prof.get(p.id) || null;
    const mine = records.filter((r) => r.userId === p.id);
    const edu = mine.filter((r) => r.kind === "EDUCATION");
    const count = (k: string) => mine.filter((r) => r.kind === k).length;
    return { p, pr, degree: edu[0]?.title || "", pubs: count("PUBLICATION"), grants: count("GRANT"), projects: count("PROJECT"), events: count("EVENT"), comp: completeness(pr, edu.length), yrs: yearsOfService(pr?.dateOfJoining) };
  });
  const depts = Array.from(new Set(rows.map((r) => r.p.department_?.name || "—"))).sort();
  const designations = Array.from(new Set(rows.map((r) => r.pr?.designation || "Not entered"))).sort();
  const shown = rows.filter((r) => (!searchParams.dept || (r.p.department_?.name || "—") === searchParams.dept) && (!searchParams.designation || (r.pr?.designation || "Not entered") === searchParams.designation));
  const sum = (f: (r: (typeof rows)[number]) => number) => shown.reduce((s, r) => s + f(r), 0);
  const avgComp = shown.length ? Math.round(sum((r) => r.comp) / shown.length) : 0;
  const byDesig = designations.map((d) => ({ d, n: shown.filter((r) => (r.pr?.designation || "Not entered") === d).length })).filter((x) => x.n > 0);
  const maxN = Math.max(1, ...byDesig.map((x) => x.n));

  return (
    <Shell roleLabel={LABEL[user.role] || "Faculty"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Faculty Details Report</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12 }}>
        Built from the profiles faculty fill in under My Profile. People who have not filled theirs in yet show a low “profile complete” score.
      </p>
      <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <select name="dept" defaultValue={searchParams.dept || ""} style={{ padding: "5px 8px" }}><option value="">All departments</option>{depts.map((d) => <option key={d}>{d}</option>)}</select>
        <select name="designation" defaultValue={searchParams.designation || ""} style={{ padding: "5px 8px" }}><option value="">All designations</option>{designations.map((d) => <option key={d}>{d}</option>)}</select>
        <button className="btn" type="submit">Filter</button>
        <a className="btn btn-brass" href="/api/faculty-report/export">Download Excel (all details)</a>
      </form>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        {[["Faculty", shown.length], ["Research papers", sum((r) => r.pubs)], ["Grants", sum((r) => r.grants)], ["Projects", sum((r) => r.projects)], ["Events", sum((r) => r.events)], ["Profiles complete (avg)", `${avgComp}%`]].map(([l, v]) => (
          <div key={String(l)} style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 18px", minWidth: 130 }}>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "Georgia, serif" }}>{v}</div>
            <div style={{ fontSize: 11.5, color: "var(--slate)" }}>{l}</div>
          </div>
        ))}
      </div>

      {byDesig.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Faculty by designation</h3>
          {byDesig.map((x) => (
            <div key={x.d} style={{ display: "grid", gridTemplateColumns: "180px 1fr 40px", gap: 10, alignItems: "center", fontSize: 13, padding: "3px 0" }}>
              <span>{x.d}</span>
              <div style={{ background: "#ECE8E0", borderRadius: 6, height: 10 }}><div style={{ width: `${(x.n / maxN) * 100}%`, height: "100%", background: "#4f7d5a", borderRadius: 6 }} /></div>
              <b style={{ textAlign: "right" }}>{x.n}</b>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th></th><th>Name</th><th>Department</th><th>Designation</th><th>Joined</th><th>Years</th><th>Highest degree</th><th>Blood</th><th>Papers</th><th>Grants</th><th>Projects</th><th>Events</th><th>Profile</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={13} style={{ color: "var(--slate)" }}>No faculty found.</td></tr>}
            {shown.map(({ p, pr, degree, pubs, grants, projects, events, comp, yrs }) => (
              <tr key={p.id}>
                <td>{pr?.photo ? <img src={pr.photo} alt="" style={{ width: 34, height: 42, objectFit: "cover", border: "1px solid var(--line)" }} /> : <span style={{ display: "inline-block", width: 34, height: 42, background: "#EEE9DD" }} />}</td>
                <td><a href={`/faculty-report/${p.id}`}><b>{p.name}</b></a></td>
                <td>{p.department_?.name || "—"}</td>
                <td>{pr?.designation || <span style={{ color: "var(--slate)" }}>—</span>}</td>
                <td>{pr?.dateOfJoining ? new Date(pr.dateOfJoining).toISOString().slice(0, 10) : "—"}</td>
                <td>{yrs ?? "—"}</td>
                <td>{degree || "—"}</td>
                <td>{pr?.bloodGroup || "—"}</td>
                <td>{pubs}</td><td>{grants}</td><td>{projects}</td><td>{events}</td>
                <td><b style={{ color: colour(comp) }}>{comp}%</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
