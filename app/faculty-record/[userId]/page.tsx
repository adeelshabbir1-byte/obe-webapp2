import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import { findOwningChairmanId } from "../../../lib/institutionCurriculum";
import { facultyRecord } from "../../../lib/facultyRecord";

export const dynamic = "force-dynamic";
export const metadata = { title: "Teacher's course record" };
const VIEW = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "OMC"];

// Every course a teacher taught / designed / ran as a lab, newest first: results, attainment and delivery.
export default async function FacultyRecordPage({ params }: { params: { userId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const self = user.id === params.userId;
  if (!self && !VIEW.includes(user.role)) redirect("/dashboard");
  const t = await prisma.user.findUnique({ where: { id: params.userId }, select: { id: true, name: true, role: true, department_: { select: { name: true } } } });
  if (!t) notFound();
  if (!self && (await findOwningChairmanId(t.id)) !== (user.role === "CHAIRMAN" ? user.id : await findOwningChairmanId(user.id))) notFound();
  const rows = await facultyRecord(t.id);
  const taught = rows.filter((r) => r.avg !== null);
  const mean = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? Math.round((10 * v.reduce((a, b) => a + b, 0)) / v.length) / 10 : null; };
  const onTime = rows.filter((r) => r.result.startsWith("approved") || r.result.startsWith("submitted")).length;
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 2 }}>{t.name}</h1>
      <p className="small-note" style={{ marginTop: 0 }}>{t.department_?.name || ""} · course record — every course taught, designed or run as a lab, newest first.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {[["Courses", rows.length], ["Teaching now", rows.filter((r) => r.term !== "—" && r.roles.some((x) => x !== "Subject Expert")).length], ["Avg class average", mean(taught.map((r) => r.avg)) ?? "—"], ["Avg pass %", mean(taught.map((r) => r.pass)) ?? "—"], ["Avg lecture coverage %", mean(rows.map((r) => r.coverage)) ?? "—"], ["Avg attendance %", mean(rows.map((r) => r.attendance)) ?? "—"], ["Results submitted / approved", onTime]].map(([l, v]) => (
          <div key={String(l)} className="card" style={{ margin: 0, minWidth: 130, padding: "10px 14px" }}><div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div><div className="small-note" style={{ margin: 0 }}>{l}</div></div>))}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? <p className="small-note">No courses yet.</p> : <table style={{ fontSize: 12.5, width: "100%" }}>
          <thead><tr><th>Term</th><th>Batch</th><th>Course</th><th>Role</th><th>Students</th><th>Class avg</th><th>Pass %</th><th>Grades A–F</th><th>CLOs reached</th><th>Lectures held</th><th>Attendance</th><th>Marks entered</th><th>Result</th><th>Plan</th><th>Notes for next time</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}>
            <td>{r.term}</td><td>{r.batch}</td><td><b>{r.course}</b> <span className="small-note">{r.ch} CH</span></td><td>{r.roles.join(", ")}</td><td>{r.students}</td>
            <td>{r.avg ?? "—"}{r.avg !== null ? "%" : ""}</td><td style={{ color: r.pass !== null && r.pass < 70 ? "#B3261E" : undefined }}>{r.pass ?? "—"}{r.pass !== null ? "%" : ""}</td>
            <td className="small-note">{r.grades.length ? r.grades.map(([g, n]) => `${g}${n}`).join(" ") : "—"}</td><td>{r.cloReached ?? "—"}</td>
            <td style={{ color: r.coverage !== null && r.coverage < 80 ? "#B26A00" : undefined }}>{r.lectures}{r.coverage !== null ? ` (${r.coverage}%)` : ""}</td>
            <td style={{ color: r.attendance !== null && r.attendance < 75 ? "#B26A00" : undefined }}>{r.attendance ?? "—"}{r.attendance !== null ? "%" : ""}</td>
            <td>{r.marks}</td><td style={{ color: r.result === "not submitted" ? "#B26A00" : undefined }}>{r.result}</td><td>{r.plan || "—"}</td><td>{r.feedForward || "—"}</td>
          </tr>)}</tbody></table>}
      </div>
      <p className="small-note">Class average and pass % from the result calculation; CLOs reached = CLOs that 60% of the class passed; coverage = lectures held of those planned; attendance = present or late of all marks.</p>
    </Shell>
  );
}
