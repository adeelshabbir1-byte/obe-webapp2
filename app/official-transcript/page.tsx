import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import StudentPicker from "../../components/StudentPicker";
import Shell from "../../components/Shell";
import PrintButton from "../../components/PrintButton";
import SignOffBlock from "../../components/SignOffBlock";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { whoIs } from "../../lib/registers";
import { bestAttemptTotals } from "../../lib/cgpaMath";
import { transcriptDoc } from "../../lib/signoffDocs";

export const dynamic = "force-dynamic";

// The official transcript: every graded course by term, term GPA, CGPA — numbered, signed off by the people who
// approved the results and the officer who issued it, with a QR code for verification.
export default async function OfficialTranscript({ searchParams }: { searchParams: { studentId?: string; q?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const w = await whoIs(user as never);
  if (!w) redirect("/dashboard");
  const all = w.head || w.exam;
  if (!all && !["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEAN"].includes(user.role)) redirect("/dashboard");
  // Batches this person may issue transcripts for.
  const batchWhere = all ? { coordinator: { managedById: w.chairmanId } } : user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : user.role === "HEAD_OF_DEPARTMENT" ? { coordinator: { managedById: w.chairmanId, departmentId: user.departmentId || "none" } } : { coordinator: { managedById: w.chairmanId, department_: { facultyId: user.facultyId || "none" } } };
  const batches = await prisma.batch.findMany({ where: batchWhere, select: { id: true } });
  const ids = batches.map((b) => b.id).concat(["none"]);
  const q = (searchParams.q || "").trim();
  const student = searchParams.studentId ? await prisma.student.findFirst({ where: { id: searchParams.studentId, batchId: { in: ids } }, select: { id: true, name: true, rollNumber: true, status: true, batchId: true, batch: { select: { degreeProgram: true, batchName: true } } } }) : null;
  const inst = await prisma.user.findUnique({ where: { id: w.chairmanId }, select: { instituteName: true } });

  const shell = (body: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{body}</Shell>;
  const finder = <StudentPicker current={student?.id || null} />;
  if (!student) return shell(<><h1 style={{ fontSize: 22, marginBottom: 6 }}>Official Transcript</h1><p className="small-note">Find a student to print a numbered, signed transcript with a QR code anyone can check.</p>{finder}</>);

  const doc = await transcriptDoc(w.chairmanId, student.id, { userId: user.id, exam: w.exam });
  if (!doc) return shell(<p>Student not found.</p>);
  const { recs, terms, cg, cgpa, issued } = doc;
  const gpa = (rs: typeof recs) => { const t = bestAttemptTotals(rs); return t.credits ? (t.points / t.credits).toFixed(2) : "—"; };

  return shell(
    <>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Official Transcript</h1>
        <div style={{ display: "flex", gap: 6 }}><a className="btn btn-secondary btn-sm" href="/official-transcript">Another student</a><PrintButton label="Print / Save as PDF" className="btn btn-brass btn-sm" /></div>
      </div>
      {finder}
      <div className="card" style={{ background: "#fff", padding: "22px 26px", color: "#1d1d1d" }}>
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.5 }}>{inst?.instituteName || "Institute"}</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>OFFICIAL TRANSCRIPT</div>
        </div>
        <table style={{ width: "100%", fontSize: 13.5, marginBottom: 12 }}><tbody>
          <tr><td style={{ fontWeight: 700, width: 140 }}>Name</td><td>{student.name}</td><td style={{ fontWeight: 700, width: 140 }}>Roll number</td><td>{student.rollNumber}</td></tr>
          <tr><td style={{ fontWeight: 700 }}>Program</td><td>{student.batch.degreeProgram}</td><td style={{ fontWeight: 700 }}>Batch</td><td>{student.batch.batchName}</td></tr>
          <tr><td style={{ fontWeight: 700 }}>CGPA</td><td><b>{cgpa}</b> ({cg.credits} credit hours)</td><td style={{ fontWeight: 700 }}>Status</td><td>{student.status.toLowerCase()}</td></tr>
        </tbody></table>
        {terms.length === 0 && <p className="small-note">No graded courses yet.</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 12 }}>
          {terms.map((t) => {
            const [name, year] = t.split("|");
            const rs = recs.filter((r) => r.termName === name && String(r.termYear) === year).sort((a, b) => a.courseCode.localeCompare(b.courseCode));
            return (
              <div key={t} style={{ breakInside: "avoid" }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, borderBottom: "2px solid #7A1F2B", marginBottom: 4 }}>{name === "Transfer" ? "Transferred credits" : `${name} ${year}`} <span style={{ float: "right", fontWeight: 400 }}>Term GPA {gpa(rs)}</span></div>
                <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
                  <thead><tr style={{ textAlign: "left" }}><th>Code</th><th>Course</th><th style={{ textAlign: "center" }}>Cr</th><th style={{ textAlign: "center" }}>Grade</th></tr></thead>
                  <tbody>{rs.map((r, i) => <tr key={i} style={{ borderTop: "1px solid #eee" }}><td>{r.courseCode}</td><td>{r.courseTitle}</td><td style={{ textAlign: "center" }}>{r.creditHours}</td><td style={{ textAlign: "center", fontWeight: 700 }}>{r.grade}</td></tr>)}</tbody>
                </table>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 11, color: "#555", marginTop: 12 }}>When a course was taken more than once, only the best attempt counts towards the CGPA. This transcript is valid only with its document number; check it by scanning the QR code.</p>
        <SignOffBlock issued={issued} />
      </div>
    </>
  );
}
