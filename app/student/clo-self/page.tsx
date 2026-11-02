import { redirect } from "next/navigation";
import { prisma } from "../../../lib/db";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import { myForm } from "../../../lib/cloSelf";
import CloSelfForm from "../../../components/CloSelfForm";

export const dynamic = "force-dynamic";

// The student rates his own confidence on each CLO of his current courses (indirect evidence; not graded).
export default async function CloSelfPage() {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  const en = await prisma.studentEnrollment.findMany({ where: { studentId: st.id, status: "ACTIVE", course: { isOffered: true } }, select: { courseId: true } });
  const forms = (await Promise.all(en.map((e) => myForm(st.id, e.courseId).catch(() => null)))).filter((f): f is NonNullable<typeof f> => !!f && f.clos.length > 0);
  return (
    <StudentShell studentName={st.name}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22 }}>How well can you do each CLO?</h1>
        <p className="small-note">Rate yourself honestly near the end of each course. This is not graded and your teacher sees only the class average; it helps improve the course.</p>
        {forms.length === 0 ? <div className="card"><p>No current course with CLOs yet.</p></div> : forms.map((f) => <CloSelfForm key={f.course.id} course={f.course} clos={f.clos} />)}
      </div>
    </StudentShell>
  );
}
