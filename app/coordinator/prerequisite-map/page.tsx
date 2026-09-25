import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { courseTypeColor } from "../../../lib/courseTypeColors";
import Shell from "../../../components/Shell";
import InteractiveCourseMap from "../../../components/InteractiveCourseMap";
import ConfirmPrerequisitesButton from "../../../components/ConfirmPrerequisitesButton";
import BatchCoursesQuickEditTable from "../../../components/BatchCoursesQuickEditTable";

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

export default async function PrerequisiteMapPage({ searchParams }: { searchParams: { degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const degrees = Array.from(new Set(allBatches.map((b) => b.degreeProgram)));
  const selectedDegree = searchParams.degree || degrees[0] || "";
  const batchesForDegree = allBatches.filter((b) => b.degreeProgram === selectedDegree);
  // A batchId from the URL only makes sense if it actually belongs to the
  // selected degree — otherwise it's a stale value left over from
  // switching the Degree dropdown without also re-picking a batch (the
  // form submits both fields together, so an out-of-sync batchId from
  // the previous selection was silently winning over the new degree).
  const requestedBatchId = searchParams.batchId && batchesForDegree.some((b) => b.id === searchParams.batchId) ? searchParams.batchId : "";
  const selectedBatchId = requestedBatchId || batchesForDegree[0]?.id || "";

  const courses = selectedBatchId
    ? await prisma.course.findMany({ where: { batchId: selectedBatchId }, include: { masterCourse: { select: { category: true } } }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] })
    : [];

  const usedTypes = Array.from(new Set(courses.map((c) => c.courseType)));

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Prerequisite Map</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        One row per semester, boxes color-coded by course type. Click two courses to set a prerequisite link.
      </p>

      <div className="card">
        <form method="GET" style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Degree</label>
            <select name="degree" defaultValue={selectedDegree} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              {degrees.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Batch</label>
            <select name="batchId" defaultValue={selectedBatchId} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              {batchesForDegree.map((b) => <option key={b.id} value={b.id}>{b.batchName}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-brass">Show Map</button>
        </form>
      </div>

      {(() => {
        const pendingBatches = allBatches.filter((b) => !b.prerequisitesConfirmedAt);
        if (pendingBatches.length === 0) return null;
        return (
          <div className="card" style={{ background: "#FFF3DC" }}>
            <h3 style={{ fontSize: 13, marginBottom: 8 }}>Still needs a prerequisite map ({pendingBatches.length})</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {pendingBatches.map((b) => (
                <a
                  key={b.id}
                  href={`/coordinator/prerequisite-map?degree=${encodeURIComponent(b.degreeProgram)}&batchId=${b.id}`}
                  style={{ fontSize: 12, color: "#8A4B00", textDecoration: "underline", background: b.id === selectedBatchId ? "#FBDFA6" : "transparent", padding: "2px 6px", borderRadius: 6 }}
                >
                  {b.degreeProgram} — {b.batchName}
                </a>
              ))}
            </div>
          </div>
        );
      })()}

      {selectedBatchId && (
        <ConfirmPrerequisitesButton
          batchId={selectedBatchId}
          confirmedAt={batchesForDegree.find((b) => b.id === selectedBatchId)?.prerequisitesConfirmedAt?.toISOString() || null}
        />
      )}

      {usedTypes.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {usedTypes.map((t) => (
              <span key={t} style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 14, height: 14, background: courseTypeColor(t), display: "inline-block", borderRadius: 6 }} />
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      <InteractiveCourseMap
        key={selectedBatchId || "none"}
        mode="prereq"
        courses={courses.map((c) => ({
          id: c.id, code: c.code, title: c.title, courseType: c.courseType, creditHours: c.creditHours,
          semesterNumber: c.semesterNumber, prerequisiteCourseId: c.prerequisiteCourseId, isOffered: c.isOffered,
          masterCourseId: c.masterCourseId,
          isUnfilledElectiveSlot: c.courseType === "Elective" && c.masterCourse?.category !== "Domain Elective",
        }))}
      />

      {selectedBatchId && (
        <BatchCoursesQuickEditTable
          key={selectedBatchId}
          initialCourses={courses.map((c) => ({ id: c.id, code: c.code, title: c.title, creditHours: c.creditHours, semesterNumber: c.semesterNumber }))}
        />
      )}
    </Shell>
  );
}
