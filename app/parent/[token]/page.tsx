import { notFound } from "next/navigation";
import { prisma } from "../../../lib/db";
import { studentOfParentToken } from "../../../lib/parentLink";
import { liveCourseStatus } from "../../../lib/studentCourseStatus";
import { computeCgpa, standingFromCgpa } from "../../../lib/academicStanding";
import { attendancePolicy, tally, percentage } from "../../../lib/attendance";
import { STUDENT_STATUS_LABEL } from "../../../lib/studentStatus";

export const dynamic = "force-dynamic";
export const metadata = { title: "Parent view" };

// A parent's read-only view of one student: attendance and marks this semester, results, fees.
export default async function ParentPage({ params }: { params: { token: string } }) {
  const sid = await studentOfParentToken(params.token);
  if (!sid) notFound();
  const s = await prisma.student.findUnique({ where: { id: sid }, select: { id: true, name: true, rollNumber: true, status: true, statusDate: true, statusReason: true, currentSemesterNumber: true, batch: { select: { degreeProgram: true, batchName: true, coordinator: { select: { managedById: true } } } } } });
  if (!s) notFound();
  const [courses, cgpa, records, invoices, pol] = await Promise.all([
    liveCourseStatus(s.id).catch(() => []), computeCgpa(s.id),
    prisma.studentTranscriptRecord.findMany({ where: { studentId: s.id }, orderBy: [{ termYear: "desc" }, { termName: "desc" }], select: { courseCode: true, courseTitle: true, termName: true, termYear: true, grade: true } }),
    prisma.feeInvoice.findMany({ where: { studentId: s.id }, orderBy: { dueDate: "desc" }, take: 8 }).catch(() => []),
    attendancePolicy(s.batch?.coordinator.managedById),
  ]);
  const att = await Promise.all(courses.map(async (c) => { const t = tally((await prisma.attendanceRecord.findMany({ where: { courseId: c.courseId, studentId: s.id }, select: { status: true } })).map((r) => r.status)); return { id: c.courseId, pct: t.marked ? percentage(t, pol) : null, marked: t.marked }; }));
  const standing = standingFromCgpa(cgpa);
  const box = { background: "#fff", border: "1px solid #E4DFCE", padding: "14px 18px", marginBottom: 12 } as const;
  return (
    <div style={{ minHeight: "100vh", background: "#F7F4EA", padding: 16 }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={box}>
          <h1 style={{ fontSize: 20, margin: 0 }}>{s.name}</h1>
          {s.status !== "ACTIVE" && <div style={{ background: s.status === "GRADUATED" ? "#E8F5EC" : "#FDECEA", color: s.status === "GRADUATED" ? "#1E7B45" : "#9B1C1C", borderRadius: 8, padding: "6px 10px", margin: "6px 0", fontSize: 13.5, fontWeight: 600 }}>Status: {STUDENT_STATUS_LABEL[s.status] || s.status}{s.statusDate ? ` since ${s.statusDate.toISOString().slice(0, 10)}` : ""}{s.statusReason ? ` — ${s.statusReason}` : ""}</div>}
          <div className="small-note">{s.rollNumber} · {s.batch?.degreeProgram} — {s.batch?.batchName} · semester {s.currentSemesterNumber}</div>
          <div style={{ marginTop: 8, fontSize: 14 }}>CGPA <b>{cgpa !== null ? cgpa.toFixed(2) : "—"}</b> · <b style={{ color: standing === "GOOD_STANDING" ? "#23894f" : "#c93c3c" }}>{standing === "GOOD_STANDING" ? "good standing" : standing === "WARNING" ? "academic warning" : "probation"}</b></div>
        </div>
        <div style={box}>
          <b>This semester</b>
          <table style={{ fontSize: 13, width: "100%", marginTop: 6 }}><thead><tr><th style={{ textAlign: "left" }}>Course</th><th>Attendance</th><th>Marks so far</th><th>Class average</th></tr></thead>
            <tbody>{courses.map((c) => { const a = att.find((x) => x.id === c.courseId); return (
              <tr key={c.courseId}><td>{c.code} {c.title}</td>
                <td style={{ textAlign: "center", fontWeight: 600, color: a?.pct != null && a.pct < pol.minPct ? "#c93c3c" : "#23894f" }}>{a?.pct != null ? `${a.pct}%` : "—"}</td>
                <td style={{ textAlign: "center" }}>{c.pctSoFar != null ? `${c.pctSoFar}%` : "—"}</td><td style={{ textAlign: "center" }}>{c.classAvgPct != null ? `${c.classAvgPct}%` : "—"}</td></tr>); })}</tbody></table>
          <p className="small-note" style={{ marginBottom: 0 }}>Attendance below {pol.minPct}% can stop a student from sitting the final exam.</p>
        </div>
        {records.length > 0 && <div style={box}><b>Results</b><table style={{ fontSize: 13, width: "100%", marginTop: 6 }}><tbody>{records.slice(0, 30).map((r, i) => <tr key={i}><td>{r.termName} {r.termYear}</td><td>{r.courseCode} {r.courseTitle}</td><td style={{ fontWeight: 700 }}>{r.grade}</td></tr>)}</tbody></table></div>}
        {invoices.length > 0 && <div style={box}><b>Fees</b><table style={{ fontSize: 13, width: "100%", marginTop: 6 }}><tbody>{invoices.map((f) => <tr key={f.id}><td>{f.termName} {f.termYear}</td><td>PKR {Math.round(f.amount - f.discount + f.fine).toLocaleString("en-US")}</td><td>paid {Math.round(f.paid).toLocaleString("en-US")}</td><td style={{ color: f.status === "PAID" ? "#23894f" : "#c93c3c" }}>{f.status.toLowerCase()} · due {f.dueDate.toISOString().slice(0, 10)}</td></tr>)}</tbody></table></div>}
        <p className="small-note" style={{ textAlign: "center" }}>Read-only view shared by the student or their advisor.</p>
      </div>
    </div>
  );
}
