import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { computeStudentTranscriptReport } from "../../../lib/studentTranscriptReport";
import Shell from "../../../components/Shell";
import ReportPrintHeader from "../../../components/ReportPrintHeader";
import TranscriptView from "../../../components/TranscriptView";
import AddHistoricalGradeForm from "../../../components/AddHistoricalGradeForm";
import { navForRole } from "../../../components/reportNav";
import { bestAttemptTotals } from "../../../lib/cgpaMath";
import DegreeSchemeBoard from "../../../components/DegreeSchemeBoard";


export default async function StudentTranscriptPage({ searchParams }: { searchParams: { studentId?: string; batchId?: string; q?: string; tab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" } ]});
  const batchIds = batches.map((b) => b.id);

  const q = searchParams.q || "";
  const matches = q
    ? await prisma.student.findMany({ where: { batchId: { in: batchIds }, OR: [{ name: { contains: q, mode: "insensitive" } }, { rollNumber: { contains: q, mode: "insensitive" } }] }, include: { batch: true }, take: 20 })
    : [];

  const student = searchParams.studentId ? await prisma.student.findUnique({ where: { id: searchParams.studentId }, include: { batch: true } }) : null;
  const belongsToCoordinator = student && batchIds.includes(student.batchId);

  const report = student && belongsToCoordinator ? await computeStudentTranscriptReport(student.id) : null;
  const courseRows = report?.courseRows || [];
  const cloAgg = report?.cloAgg || new Map<string, { attempted: number; passed: number }>();
  const ploAgg = report?.ploAgg || new Map<string, { attempted: number; passed: number }>();
  const remediation = report?.remediation || [];
  const remaining = report?.remaining || [];
  const cgpa = report?.cgpa ?? null;
  const totalCredits = report?.totalCredits || 0;

  // Batch-level aggregate view (no specific student selected, but a batch is).
  const selectedBatchId = searchParams.batchId || "";
  let batchSummary: { studentCount: number; avgCgpa: number | null; programCredits: number; semesterCredits: { sem: number; cr: number }[]; rows: { id: string; name: string; roll: string; cgpa: number | null; earned: number; attempted: number }[]; cloAgg: Map<string, { attempted: number; passed: number }>; ploAgg: Map<string, { attempted: number; passed: number }> } | null = null;
  if (!student && selectedBatchId && batchIds.includes(selectedBatchId)) {
    const studentsInBatch = await prisma.student.findMany({ where: { batchId: selectedBatchId } });
    const records = await prisma.studentTranscriptRecord.findMany({ where: { studentId: { in: studentsInBatch.map((s) => s.id) } } });
    const byStudentGpa = new Map<string, { credits: number; points: number }>();
    const bCloAgg = new Map<string, { attempted: number; passed: number }>();
    const bPloAgg = new Map<string, { attempted: number; passed: number }>();
    for (const r of records) {
      if (r.gpaPoints !== null) {
        const e = byStudentGpa.get(r.studentId) || { credits: 0, points: 0 };
        e.credits += r.creditHours; e.points += r.gpaPoints * r.creditHours;
        byStudentGpa.set(r.studentId, e);
      }
      for (const c of JSON.parse(r.cloAttainmentJson) as { code: string; passed: boolean }[]) {
        const e = bCloAgg.get(c.code) || { attempted: 0, passed: 0 };
        e.attempted++; if (c.passed) e.passed++;
        bCloAgg.set(c.code, e);
      }
      for (const p of JSON.parse(r.ploAttainmentJson) as { label: string; passed: boolean }[]) {
        const e = bPloAgg.get(p.label) || { attempted: 0, passed: 0 };
        e.attempted++; if (p.passed) e.passed++;
        bPloAgg.set(p.label, e);
      }
    }
    // CGPA per student on the best attempt of each course; credit hours passed (best attempt above zero) and attempted.
    const rows = studentsInBatch.map((st) => {
      const mine = records.filter((r) => r.studentId === st.id);
      const t = bestAttemptTotals(mine);
      const passedCodes = new Map<string, number>();
      for (const r of mine) if ((r.gpaPoints !== null && r.gpaPoints > 0) || r.grade === "P") passedCodes.set(r.courseCode.trim().toUpperCase(), r.creditHours);
      return { id: st.id, name: st.name, roll: st.rollNumber, cgpa: t.credits > 0 ? Math.round((t.points / t.credits) * 100) / 100 : null, earned: Array.from(passedCodes.values()).reduce((n, c) => n + c, 0), attempted: mine.reduce((n, r) => n + r.creditHours, 0) };
    }).sort((a, b) => (a.cgpa ?? 9) - (b.cgpa ?? 9));
    const semCr = await prisma.course.groupBy({ by: ["semesterNumber"], where: { batchId: selectedBatchId, isNonCredit: false }, _sum: { creditHours: true } });
    const gpas = rows.map((r) => r.cgpa).filter((g): g is number => g !== null);
    batchSummary = {
      studentCount: studentsInBatch.length,
      programCredits: semCr.reduce((n, r) => n + (r._sum.creditHours || 0), 0),
      semesterCredits: semCr.filter((r) => r.semesterNumber).sort((a, b) => (a.semesterNumber || 0) - (b.semesterNumber || 0)).map((r) => ({ sem: r.semesterNumber as number, cr: r._sum.creditHours || 0 })),
      rows,
      avgCgpa: gpas.length > 0 ? Math.round((gpas.reduce((s, g) => s + g, 0) / gpas.length) * 100) / 100 : null,
      cloAgg: bCloAgg, ploAgg: bPloAgg,
    };
  }

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Student Transcript" />
      <div className="card no-print">
        <form method="GET" style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <input name="q" defaultValue={q} placeholder="Search by name or roll number..." style={{ flex: 1, padding: "7px 10px", border: "1px solid var(--line)" }} />
          <button type="submit" className="btn btn-brass">Search</button>
        </form>
        {matches.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {matches.map((m) => (
              <a key={m.id} href={`/coordinator/student-transcript?studentId=${m.id}`} style={{ display: "block", padding: "6px 4px", fontSize: 13, color: "var(--brass-dark)", textDecoration: "none", borderBottom: "1px solid var(--line)" }}>
                {m.name} — {m.rollNumber} ({m.batch.degreeProgram} — {m.batch.batchName})
              </a>
            ))}
          </div>
        )}
        <form method="GET" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ fontSize: 11.5, color: "var(--slate)" }}>Or view a whole batch:</label>
          <select name="batchId" defaultValue={selectedBatchId} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
            <option value="">— Select a batch —</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}
          </select>
          <button type="submit" className="btn btn-brass" style={{ padding: "5px 12px", fontSize: 12 }}>View Batch</button>
        </form>
      </div>

      {searchParams.studentId && !belongsToCoordinator && (
        <div className="card"><p style={{ color: "var(--rust)", fontSize: 12.5 }}>Student not found in your program.</p></div>
      )}

      {batchSummary && (
        <>
          <div className="card">
            <p style={{ fontSize: 13 }}><b>{batches.find((b) => b.id === selectedBatchId)?.degreeProgram} — {batches.find((b) => b.id === selectedBatchId)?.batchName}</b></p>
            <p style={{ fontSize: 13, marginTop: 6 }}><b>{batchSummary.studentCount} students</b>{batchSummary.avgCgpa !== null && <> — Average CGPA: <b>{batchSummary.avgCgpa.toFixed(2)}</b></>}
              {" "}— Program credit hours: <b>{batchSummary.programCredits}</b>
              {batchSummary.rows.some((r) => r.cgpa !== null && r.cgpa < 2) && <> — <b style={{ color: "#B3261E" }}>{batchSummary.rows.filter((r) => r.cgpa !== null && r.cgpa < 2).length} below 2.00</b></>}</p>
            {batchSummary.semesterCredits.length > 0 && (
              <p style={{ fontSize: 12, color: "var(--slate)", marginTop: 4 }}>Credit hours per semester: {batchSummary.semesterCredits.map((x) => `S${x.sem} ${x.cr}`).join(" · ")}</p>
            )}
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Students — CGPA and credit hours</h3>
            <table>
              <thead><tr><th>Roll no.</th><th>Name</th><th>CGPA</th><th>Credit hours passed</th><th>Credit hours attempted</th><th>Still to pass</th><th></th></tr></thead>
              <tbody>
                {batchSummary.rows.map((r) => (
                  <tr key={r.id} style={r.cgpa !== null && r.cgpa < 2 ? { background: "#FBEAEA" } : undefined}>
                    <td>{r.roll}</td><td>{r.name}</td>
                    <td><b style={{ color: r.cgpa !== null && r.cgpa < 2 ? "#B3261E" : undefined }}>{r.cgpa !== null ? r.cgpa.toFixed(2) : "—"}</b></td>
                    <td>{r.earned}</td><td>{r.attempted}</td><td>{Math.max(0, batchSummary!.programCredits - r.earned)}</td>
                    <td><a href={`/coordinator/student-transcript?studentId=${r.id}#degree-plan`} className="act act-primary">Transcript &amp; plan</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>CLO-Wise Attainment — Whole Batch</h3>
            <table>
              <thead><tr><th>CLO</th><th>Attempted</th><th>Passed</th><th>Pass Rate</th></tr></thead>
              <tbody>
                {batchSummary.cloAgg.size === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No historical data yet for this batch.</td></tr>}
                {Array.from(batchSummary.cloAgg.entries()).map(([code, v]) => (
                  <tr key={code}><td>{code}</td><td>{v.attempted}</td><td style={{ color: "var(--sage)", fontWeight: 600 }}>{v.passed}</td><td>{Math.round((v.passed / v.attempted) * 100)}%</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>GA-Wise Attainment — Whole Batch</h3>
            <table>
              <thead><tr><th>GA</th><th>Attempted</th><th>Passed</th><th>Pass Rate</th></tr></thead>
              <tbody>
                {batchSummary.ploAgg.size === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No historical data yet for this batch.</td></tr>}
                {Array.from(batchSummary.ploAgg.entries()).map(([label, v]) => (
                  <tr key={label}><td>{label}</td><td>{v.attempted}</td><td style={{ color: "var(--sage)", fontWeight: 600 }}>{v.passed}</td><td>{Math.round((v.passed / v.attempted) * 100)}%</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {student && belongsToCoordinator && (
        <AddHistoricalGradeForm studentId={student.id} />
      )}
      {student && belongsToCoordinator && (
        <div id="degree-plan"><TranscriptView studentId={student.id} tab={searchParams.tab || "grades"} base={`/coordinator/student-transcript?studentId=${student.id}`} staff /></div>
      )}
    </Shell>
  );
}
