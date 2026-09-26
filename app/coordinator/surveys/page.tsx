import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { roleLabel, chairmanIdFor } from "../../../lib/reportScope";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import SurveysManager from "../../../components/SurveysManager";

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

export default async function SurveysPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR" && !user.isAlumniCustodian) redirect("/dashboard");

  const chairmanId = await chairmanIdFor(user);
  const coordinators = chairmanId ? await prisma.user.findMany({ where: { managedById: chairmanId, role: "PROGRAM_COORDINATOR" } }) : [];
  const coordinatorIds = coordinators.map((c) => c.id);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } } });
  const plos = await prisma.pLO.findMany({ where: { batchId: { in: batches.map((b) => b.id) } }, orderBy: { number: "asc" } });
  const surveys = await prisma.surveyTemplate.findMany({
    where: { coordinatorId: { in: coordinatorIds } },
    include: { questions: true, _count: { select: { responses: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={user.role === "PROGRAM_COORDINATOR" ? NAV : navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Feedback Surveys</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Measure indirect PLO attainment through stakeholder feedback — a second evidence source alongside direct
        (assessment-based) attainment, mapped to your Program Learning Outcomes.
      </p>
      <SurveysManager
        surveys={surveys.map((s) => ({ id: s.id, title: s.title, stakeholderType: s.stakeholderType, questions: s.questions.map((q) => ({ id: q.id, text: q.text })), _count: s._count }))}
        plos={Array.from(new Map(plos.map((p) => [p.number, p])).values()).map((p) => ({ id: p.id, number: p.number, title: p.title }))}
      />
    </Shell>
  );
}
