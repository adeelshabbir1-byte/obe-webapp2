import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import { REPORT_VIEWER_ROLES, completeness, reportPeople, yearsOfService, experienceSummary, ymText } from "../../lib/facultyProfile";
import ExcelUploadForm from "../../components/ExcelUploadForm";

const LABEL: Record<string, string> = { HEAD_OF_DEPARTMENT: "Chairman", DEAN: "Dean", PROGRAM_COORDINATOR: "Program Lead", DEPARTMENT_COORDINATOR: "Program Coordinator", CHAIRMAN: "Institute Head" };
const colour = (p: number) => (p >= 80 ? "#2E7D4F" : p >= 50 ? "#C58A12" : "#B3261E");

export default async function FacultyReportPage({ searchParams }: { searchParams: { dept?: string; designation?: string; role?: string; edu?: string; spec?: string; group?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!REPORT_VIEWER_ROLES.includes(user.role)) redirect("/dashboard");

  const people = await reportPeople(user);
  const ids = people.map((p) => p.id);
  const [profiles, records] = await Promise.all([
    prisma.facultyProfile.findMany({ where: { userId: { in: ids.length ? ids : ["none"] } }, select: { userId: true, photo: true, designation: true, dateOfJoining: true, bloodGroup: true, phone: true, nextOfKinName: true, nextOfKinPhone: true, employmentType: true } }),
    prisma.facultyRecord.findMany({ where: { userId: { in: ids.length ? ids : ["none"] } } }),
  ]);
  const prof = new Map(profiles.map((p) => [p.userId, p]));
  const rows = people.map((p) => {
    const pr = prof.get(p.id) || null;
    const mine = records.filter((r) => r.userId === p.id);
    const edu = mine.filter((r) => r.kind === "EDUCATION");
    const count = (k: string) => mine.filter((r) => r.kind === k).length;
    return { p, pr, degree: edu[0]?.title || "", pubs: count("PUBLICATION"), grants: count("GRANT"), projects: count("PROJECT"), events: count("EVENT"), comp: completeness(pr, edu.length), yrs: yearsOfService(pr?.dateOfJoining), exp: experienceSummary(pr?.dateOfJoining, mine) };
  });
  const eduOf = (deg: string) => /ph\.?\s?d|doctor/i.test(deg) ? "PhD" : /\bm\.?\s?(s|phil|sc|ba|a|e)\b|master|mphil/i.test(deg) ? "MS / MPhil" : /\bb\.?\s?(s|sc|e|a|ba)\b|bachelor/i.test(deg) ? "BS / BSc" : deg ? "Other" : "Not entered";
  const roleOf = (r: (typeof rows)[number]) => r.p.role === "LAB_ENGINEER" || r.p.secondaryRole === "LAB_ENGINEER" ? "Lab engineers / lab instructors" : "Instructors";
  const specOf = (r: (typeof rows)[number]) => (r.pr as { specialization?: string | null } | null)?.specialization || r.p.specialization || "Not entered";
  const depts = Array.from(new Set(rows.map((r) => r.p.department_?.name || "—"))).sort();
  const designations = Array.from(new Set(rows.map((r) => r.pr?.designation || "Not entered"))).sort();
  const roles = Array.from(new Set(rows.map(roleOf))).sort(), edus = ["PhD", "MS / MPhil", "BS / BSc", "Other", "Not entered"].filter((e) => rows.some((r) => eduOf(r.degree) === e)), specs = Array.from(new Set(rows.map(specOf))).sort();
  const shown0 = rows.filter((r) => (!searchParams.role || roleOf(r) === searchParams.role) && (!searchParams.edu || eduOf(r.degree) === searchParams.edu) && (!searchParams.spec || specOf(r) === searchParams.spec));
  const shown = shown0.filter((r) => (!searchParams.dept || (r.p.department_?.name || "—") === searchParams.dept) && (!searchParams.designation || (r.pr?.designation || "Not entered") === searchParams.designation));
  const sum = (f: (r: (typeof rows)[number]) => number) => shown.reduce((s, r) => s + f(r), 0);
  const avgComp = shown.length ? Math.round(sum((r) => r.comp) / shown.length) : 0;
  const byDesig = designations.map((d) => ({ d, n: shown.filter((r) => (r.pr?.designation || "Not entered") === d).length })).filter((x) => x.n > 0);
  const maxN = Math.max(1, ...byDesig.map((x) => x.n));

  return (
    <Shell roleLabel={LABEL[user.role] || "Faculty"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Faculty Directory</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12 }}>
        Built from the profiles faculty fill in under My Profile. People who have not filled theirs in yet show a low “profile complete” score.
      </p>
      <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <select name="dept" defaultValue={searchParams.dept || ""} style={{ padding: "5px 8px" }}><option value="">All departments</option>{depts.map((d) => <option key={d}>{d}</option>)}</select>
        <select name="designation" defaultValue={searchParams.designation || ""} style={{ padding: "5px 8px" }}><option value="">All designations</option>{designations.map((d) => <option key={d}>{d}</option>)}</select>
        <select name="role" defaultValue={searchParams.role || ""} style={{ padding: "5px 8px" }}><option value="">Instructors and lab staff</option>{roles.map((d) => <option key={d}>{d}</option>)}</select>
        <select name="edu" defaultValue={searchParams.edu || ""} style={{ padding: "5px 8px" }}><option value="">Any education</option>{edus.map((d) => <option key={d}>{d}</option>)}</select>
        <select name="spec" defaultValue={searchParams.spec || ""} style={{ padding: "5px 8px", maxWidth: 200 }}><option value="">Any specialisation</option>{specs.map((d) => <option key={d}>{d}</option>)}</select>
        <select name="group" defaultValue={searchParams.group || ""} style={{ padding: "5px 8px" }}><option value="">Count by…</option><option value="designation">Designation</option><option value="role">Instructors / lab staff</option><option value="edu">Education</option><option value="spec">Specialisation</option><option value="dept">Department</option></select>
        <button className="btn" type="submit">Show</button>
        <a className="btn btn-brass" href="/api/faculty-report/export">Download Excel (all details)</a>
      </form>
      <div className="card" style={{ display: "grid", gap: 6 }}>
        <b style={{ fontSize: 13 }}>Update details from Excel</b>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><a className="btn btn-secondary btn-sm" href="/api/faculty-report/details">1. Download the details sheet</a><ExcelUploadForm url="/api/faculty-report/details" label="2. Upload it back" help="Only empty fields are filled — anything a teacher already entered in My Profile is kept." /></div>
      </div>
      {searchParams.group && (() => {
        const key = (r: (typeof rows)[number]) => searchParams.group === "role" ? roleOf(r) : searchParams.group === "edu" ? eduOf(r.degree) : searchParams.group === "spec" ? specOf(r) : searchParams.group === "dept" ? r.p.department_?.name || "—" : r.pr?.designation || "Not entered";
        const groups = Array.from(new Set(shown.map(key))).map((g) => ({ g, xs: shown.filter((r) => key(r) === g) })).sort((a, b) => b.xs.length - a.xs.length);
        return <div className="card" style={{ overflowX: "auto" }}><table style={{ fontSize: 12.5, width: "100%" }}><thead><tr><th>Group</th><th>People</th><th>PhD</th><th>MS / MPhil</th><th>Names</th></tr></thead>
          <tbody>{groups.map(({ g, xs }) => <tr key={g}><td><b>{g}</b></td><td>{xs.length}</td><td>{xs.filter((r) => eduOf(r.degree) === "PhD").length}</td><td>{xs.filter((r) => eduOf(r.degree) === "MS / MPhil").length}</td><td className="small-note">{xs.map((r) => r.p.name).join(", ")}</td></tr>)}</tbody></table></div>;
      })()}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        {[["Faculty", shown.length], ["Research papers", sum((r) => r.pubs)], ["Grants", sum((r) => r.grants)], ["Projects", sum((r) => r.projects)], ["Events", sum((r) => r.events)], ["Avg. overall experience", shown.length ? ymText(sum((r) => r.exp.total) / shown.length) : "—"], ["Profiles complete (avg)", `${avgComp}%`]].map(([l, v]) => (
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
          <thead><tr><th></th><th>Name</th><th>Department</th><th>Designation</th><th>Joined</th><th title="Years at this institute, from the joining date">Here</th><th title="Teaching / academic years, all institutions">Teaching</th><th>Industry</th><th title="All experience, overlaps counted once">Overall</th><th>Highest degree</th><th>Blood</th><th>Papers</th><th>Grants</th><th>Projects</th><th>Events</th><th>Profile</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={16} style={{ color: "var(--slate)" }}>No faculty found.</td></tr>}
            {shown.map(({ p, pr, degree, pubs, grants, projects, events, comp, yrs, exp }) => (
              <tr key={p.id}>
                <td>{pr?.photo ? <img src={pr.photo} alt="" style={{ width: 34, height: 42, objectFit: "cover", border: "1px solid var(--line)" }} /> : <span style={{ display: "inline-block", width: 34, height: 42, background: "#EEE9DD" }} />}</td>
                <td><a href={`/faculty-report/${p.id}`}><b>{p.name}</b></a> <a className="small-note" href={`/faculty-record/${p.id}`}>courses →</a></td>
                <td>{p.department_?.name || "—"}</td>
                <td>{pr?.designation || <span style={{ color: "var(--slate)" }}>—</span>}</td>
                <td>{pr?.dateOfJoining ? new Date(pr.dateOfJoining).toISOString().slice(0, 10) : "—"}</td>
                <td>{ymText(exp.institute)}</td><td>{ymText(exp.teaching)}</td><td>{ymText(exp.industry)}</td><td><b>{ymText(exp.total)}</b></td>
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
