import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { computeStudentTranscriptReport } from "../../../lib/studentTranscriptReport";
import StudentTranscriptReport from "../../../components/StudentTranscriptReport";

export default async function StudentTranscriptPage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  if (student.mustChangePassword) redirect("/student/change-password");

  const report = await computeStudentTranscriptReport(student.id);

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", padding: "40px 20px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, flexWrap: "wrap", gap: 10 }}>
          <h1 style={{ fontSize: 22 }}>My Transcript</h1>
          <div style={{ display: "flex", gap: 14 }}>
            <a href="/student/obe-analytics" style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>My OBE Progress</a>
            <a href="/student/degree-plan" style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>Degree Plan</a>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 20 }}>
          Two separate records: your course grades and GPA/CGPA (Transcript 1), and which Course/Program Learning
          Outcomes you've met so far (Transcript 2).
        </p>
        <StudentTranscriptReport
          studentName={student.name} rollNumber={student.rollNumber}
          batchLabel={`${student.batch.degreeProgram} (${student.batch.batchName})`}
          courseRows={report.courseRows} cgpa={report.cgpa} totalCredits={report.totalCredits}
          cloAgg={report.cloAgg} ploAgg={report.ploAgg} remediation={report.remediation}
        />
      </div>
    </div>
  );
}
