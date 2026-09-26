import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { courseTypeColor } from "../../../lib/courseTypeColors";
import Shell from "../../../components/Shell";
import BulkSyncButton from "../../../components/BulkSyncButton";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/assign-subject-experts", label: "Assign Subject Experts" },
  { href: "/coordinator/elective-options", label: "Elective Options" },
  { href: "/coordinator/custom-categories", label: "Course & Faculty Categories" },
  { href: "/coordinator/out-of-batch-requests", label: "Out-of-Batch Requests" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
  { href: "/coordinator/timetable", label: "Timetable" },
  { href: "/coordinator/calendar", label: "Calendar & Exam Dates" },
  { href: "/coordinator/students", label: "Students" },
  { href: "/coordinator/bulk-student-upload", label: "Bulk Student Upload (Multi-Batch)" },
  { href: "/coordinator/repeat-offering", label: "Repeat/Summer Offering" },
  { href: "/coordinator/grading-scale", label: "Grading Scale" },
  { href: "/coordinator/assignment-history", label: "Assignment History" },
  { href: "/coordinator/report-bundles", label: "Report Bundles" },
  { href: "/coordinator/program-profile", label: "Program Document" },
  { href: "/coordinator/required-books", label: "Required Textbooks" },
  { href: "/coordinator/student-transcript", label: "Student Transcript" },
  { href: "/coordinator/stakeholders", label: "Alumni & Employers" },
  { href: "/coordinator/surveys", label: "Feedback Surveys" },
  { href: "/coordinator/load-report", label: "Teacher Load Report" },
  { href: "/coordinator/elective-instructor-report", label: "Elective Instructor Report" },
  { href: "/coordinator/program-semester-map", label: "Program Semester Map" },
  { href: "/coordinator/curriculum-readiness-matrix", label: "Curriculum Readiness Matrix" },
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

function StatusBadge({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  const bg = ok ? "#E2F4E8" : warn ? "#FBEED2" : "#FBE2DF";
  const fg = ok ? "#4B7A63" : warn ? "#96650F" : "#B1512E";
  return <span style={{ background: bg, color: fg, fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 3, whiteSpace: "nowrap" }}>{label}</span>;
}

export default async function CurriculumReadinessMatrixPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const selectedBatchId = searchParams.batchId || batches[0]?.id || "";

  const [courses, ploCount] = await Promise.all([
    selectedBatchId
      ? prisma.course.findMany({
          where: { batchId: selectedBatchId },
          include: { lectureRows: { where: { source: "SE" } }, clos: { where: { source: "SE" } } },
          orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
        })
      : [],
    selectedBatchId ? prisma.pLO.count({ where: { batchId: selectedBatchId } }) : 0,
  ]);

  const rows = courses.map((c) => {
    const lectureCount = c.lectureRows.length;
    const cloCount = c.clos.length;
    const mappedCount = c.clos.filter((clo) => clo.mappedPloId !== null).length;
    return { ...c, lectureCount, cloCount, mappedCount };
  });

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Curriculum Readiness Matrix</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Every course in a batch, its HEC category, and whether it has lectures, CLOs, and PLO mapping set up
        — a quick visual sweep for what still needs attention before a semester starts. Read-only.
      </p>

      <BulkSyncButton />

      <div className="card">
        <form method="GET" style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Batch</label>
            <select name="batchId" defaultValue={selectedBatchId} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-brass">Show Matrix</button>
        </form>
      </div>

      {selectedBatchId && ploCount === 0 && (
        <div className="card" style={{ background: "#FBE2DF" }}>
          <p style={{ fontSize: 12.5, color: "#B1512E" }}>
            This batch has no Program Learning Outcomes defined at all yet — every course's PLO mapping
            below will show as unmapped until PLOs are added on the Program Learning Outcomes page.
          </p>
        </div>
      )}

      {courses.length === 0 && selectedBatchId && (
        <div className="card"><p style={{ fontSize: 12.5, color: "var(--slate)" }}>No courses found in this batch.</p></div>
      )}

      {courses.length > 0 && (
        <div className="card">
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid var(--line)" }}>
                  <th style={{ padding: "6px 10px" }}>Sem</th>
                  <th style={{ padding: "6px 10px" }}>Code</th>
                  <th style={{ padding: "6px 10px" }}>Title</th>
                  <th style={{ padding: "6px 10px" }}>Category</th>
                  <th style={{ padding: "6px 10px" }}>Lectures</th>
                  <th style={{ padding: "6px 10px" }}>CLOs</th>
                  <th style={{ padding: "6px 10px" }}>PLO Mapping</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "6px 10px", color: "var(--slate)" }}>{c.semesterNumber ?? "—"}</td>
                    <td style={{ padding: "6px 10px", fontWeight: 600 }}>{c.code}</td>
                    <td style={{ padding: "6px 10px" }}>{c.title}</td>
                    <td style={{ padding: "6px 10px" }}>
                      <span style={{ fontSize: 10.5, padding: "3px 9px", borderRadius: 3, background: courseTypeColor(c.courseType), color: "#fff", fontWeight: 600 }}>
                        {c.courseType}
                      </span>
                    </td>
                    <td style={{ padding: "6px 10px" }}>
                      <StatusBadge ok={c.lectureCount > 0} label={`${c.lectureCount} lecture${c.lectureCount === 1 ? "" : "s"}`} />
                    </td>
                    <td style={{ padding: "6px 10px" }}>
                      <StatusBadge ok={c.cloCount > 0} label={`${c.cloCount} CLO${c.cloCount === 1 ? "" : "s"}`} />
                    </td>
                    <td style={{ padding: "6px 10px" }}>
                      {c.cloCount === 0
                        ? <StatusBadge ok={false} label="No CLOs yet" />
                        : c.mappedCount === c.cloCount
                          ? <StatusBadge ok={true} label={`${c.mappedCount}/${c.cloCount} mapped`} />
                          : c.mappedCount > 0
                            ? <StatusBadge ok={false} warn={true} label={`${c.mappedCount}/${c.cloCount} mapped`} />
                            : <StatusBadge ok={false} label={`0/${c.cloCount} mapped`} />
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Shell>
  );
}
