import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import ProgramProfileForm from "../../../components/ProgramProfileForm";
import PeoAlignmentCheck from "../../../components/PeoAlignmentCheck";

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

export default async function ProgramProfilePage({ searchParams }: { searchParams: { degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const degrees = Array.from(new Set(batches.map((b) => b.degreeProgram)));
  const selectedDegree = searchParams.degree || degrees[0] || "";
  const batchesForDegree = batches.filter((b) => b.degreeProgram === selectedDegree);
  const selectedBatchId = searchParams.batchId || batchesForDegree[0]?.id || "";

  const profile = selectedDegree
    ? await prisma.programProfile.findUnique({ where: { coordinatorId_degreeProgram: { coordinatorId: user.id, degreeProgram: selectedDegree } } })
    : null;

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Program Document</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Fill in your department's narrative content once per degree program, then generate the full program
        document (title page, PEOs/PLOs, program structure, study plan, and every course's detailed syllabus)
        as a Word file, matching a full curriculum submission format.
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
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Batch (used for the study plan & syllabi)</label>
            <select name="batchId" defaultValue={selectedBatchId} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              {batchesForDegree.map((b) => <option key={b.id} value={b.id}>{b.batchName}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-brass">Load</button>
        </form>
      </div>

      {selectedDegree && (
        <>
          <ProgramProfileForm
            degreeProgram={selectedDegree}
            initial={{
              departmentIntro: profile?.departmentIntro || null, departmentVision: profile?.departmentVision || null,
              departmentMission: profile?.departmentMission || null, peos: profile?.peos ? JSON.parse(profile.peos) : [],
            }}
          />
          {selectedBatchId && (
            <>
              <PeoAlignmentCheck
                degreeProgram={selectedDegree}
                batchId={selectedBatchId}
                peoCount={profile?.peos ? JSON.parse(profile.peos).length : 0}
              />
              <div className="card">
                <h3 style={{ fontSize: 14, marginBottom: 8 }}>Generate the Document</h3>
                <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 10 }}>
                  Uses this batch's current courses and their Subject Experts' plans (CLOs, weekly content, textbooks).
                </p>
                <a href={`/api/coordinator/program-document?batchId=${selectedBatchId}`} className="btn btn-brass" style={{ textDecoration: "none" }}>Download Word Document</a>
              </div>
            </>
          )}
        </>
      )}
    </Shell>
  );
}
