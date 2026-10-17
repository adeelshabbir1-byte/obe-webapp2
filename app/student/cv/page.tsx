import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import CvEditor from "../../../components/CvEditor";
import { cvOf } from "../../../lib/studentCv";

export const dynamic = "force-dynamic";

export default async function StudentCvPage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  const { row, data } = await cvOf(student.id);
  return (
    <StudentShell studentName={student.name}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My Profile &amp; CV</h1>
      <p style={{ color: "var(--slate)", fontSize: 13 }}>Build your CV once; your program, batch, CGPA (only if you tick it) and Final Year Project are added automatically. A teacher reviews it; once approved you can share it with industry (FYP open house and the batch CV book).</p>
      <CvEditor studentId={student.id} initial={data} showCgpa={!!row?.showCgpa} status={row?.status || "DRAFT"} published={!!row?.published} note={row?.status === "CHANGES" ? row.reviewerNote : null} />
    </StudentShell>
  );
}
