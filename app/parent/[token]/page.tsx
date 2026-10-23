import { notFound } from "next/navigation";
import { prisma } from "../../../lib/db";
import { studentOfParentToken } from "../../../lib/parentLink";
import { liveCourseStatus } from "../../../lib/studentCourseStatus";
import { computeCgpa, standingFromCgpa } from "../../../lib/academicStanding";
import { attendancePolicy, tally, percentage } from "../../../lib/attendance";
import { STUDENT_STATUS_LABEL } from "../../../lib/studentStatus";
import { pt, URDU_FONT, urduStyle, type Lang } from "../../../lib/urdu";

export const dynamic = "force-dynamic";
export const metadata = { title: "Parent view" };

// A parent's read-only view of one student: attendance and marks this semester, results, fees.
export default async function ParentPage({ params, searchParams }: { params: { token: string }; searchParams: { lang?: string } }) {
  const lang: Lang = searchParams.lang === "ur" ? "ur" : "en";
  const t = (k: string, n?: number) => pt(lang, k, n);
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
    <div style={{ minHeight: "100vh", background: "#F7F4EA", padding: 16, ...(lang === "ur" ? urduStyle : {}) }} lang={lang}>
      {lang === "ur" && <link rel="stylesheet" href={URDU_FONT} />}
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ textAlign: lang === "ur" ? "left" : "right", marginBottom: 6 }}><a href={`?lang=${lang === "ur" ? "en" : "ur"}`}>{t("switch")}</a></div>
        <div style={box}>
          <h1 style={{ fontSize: 20, margin: 0 }}>{s.name}</h1>
          {s.status !== "ACTIVE" && <div style={{ background: s.status === "GRADUATED" ? "#E8F5EC" : "#FDECEA", color: s.status === "GRADUATED" ? "#1E7B45" : "#9B1C1C", borderRadius: 8, padding: "6px 10px", margin: "6px 0", fontSize: 13.5, fontWeight: 600 }}>{t("status")}: {STUDENT_STATUS_LABEL[s.status] || s.status}{s.statusDate ? ` ${t("since")} ${s.statusDate.toISOString().slice(0, 10)}` : ""}{s.statusReason ? ` — ${s.statusReason}` : ""}</div>}
          <div className="small-note">{s.rollNumber} · {s.batch?.degreeProgram} — {s.batch?.batchName} · {t("semester")} {s.currentSemesterNumber}</div>
          <div style={{ marginTop: 8, fontSize: 14 }}>{t("cgpa")} <b>{cgpa !== null ? cgpa.toFixed(2) : "—"}</b> · <b style={{ color: standing === "GOOD_STANDING" ? "#23894f" : "#c93c3c" }}>{standing === "GOOD_STANDING" ? t("good") : standing === "WARNING" ? t("warning") : t("probation")}</b></div>
        </div>
        <div style={box}>
          <b>{t("thisSem")}</b>
          <table style={{ fontSize: 13, width: "100%", marginTop: 6 }}><thead><tr><th style={{ textAlign: lang === "ur" ? "right" : "left" }}>{t("course")}</th><th>{t("attendance")}</th><th>{t("marks")}</th><th>{t("avg")}</th></tr></thead>
            <tbody>{courses.map((c) => { const a = att.find((x) => x.id === c.courseId); return (
              <tr key={c.courseId}><td>{c.code} {c.title}</td>
                <td style={{ textAlign: "center", fontWeight: 600, color: a?.pct != null && a.pct < pol.minPct ? "#c93c3c" : "#23894f" }}>{a?.pct != null ? `${a.pct}%` : "—"}</td>
                <td style={{ textAlign: "center" }}>{c.pctSoFar != null ? `${c.pctSoFar}%` : "—"}</td><td style={{ textAlign: "center" }}>{c.classAvgPct != null ? `${c.classAvgPct}%` : "—"}</td></tr>); })}</tbody></table>
          <p className="small-note" style={{ marginBottom: 0 }}>{t("low", pol.minPct)}</p>
        </div>
        {records.length > 0 && <div style={box}><b>{t("results")}</b><table style={{ fontSize: 13, width: "100%", marginTop: 6 }}><tbody>{records.slice(0, 30).map((r, i) => <tr key={i}><td>{r.termName} {r.termYear}</td><td>{r.courseCode} {r.courseTitle}</td><td style={{ fontWeight: 700 }}>{r.grade}</td></tr>)}</tbody></table></div>}
        {invoices.length > 0 && <div style={box}><b>{t("fees")}</b><table style={{ fontSize: 13, width: "100%", marginTop: 6 }}><tbody>{invoices.map((f) => <tr key={f.id}><td>{f.termName} {f.termYear}</td><td>PKR {Math.round(f.amount - f.discount + f.fine).toLocaleString("en-US")}</td><td>{t("paid")} {Math.round(f.paid).toLocaleString("en-US")}</td><td style={{ color: f.status === "PAID" ? "#23894f" : "#c93c3c" }}>{f.status === "PAID" ? t("paidS") : f.status === "PARTIAL" ? t("partial") : t("unpaid")} · {t("due")} {f.dueDate.toISOString().slice(0, 10)}</td></tr>)}</tbody></table></div>}
        <p className="small-note" style={{ textAlign: "center" }}>{t("readonly")}</p>
      </div>
    </div>
  );
}
