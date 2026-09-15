import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import CourseSubNav from "../../../../../components/CourseSubNav";
import PaperDistributionManager from "../../../../../components/PaperDistributionManager";
import { navForRole } from "../../../../../components/reportNav";


export default async function SePaperDistributionPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.subjectExpertId !== user.id) notFound();

  const [items, lectureRows, clos] = await Promise.all([
    prisma.paperDistributionItem.findMany({ where: { courseId: course.id, source: "SE" }, orderBy: { orderIndex: "asc" } }),
    prisma.lectureRow.findMany({ where: { courseId: course.id, source: "SE" }, orderBy: { lectureNumber: "asc" } }),
    prisma.cLO.findMany({ where: { courseId: course.id, source: "SE" }, orderBy: { orderIndex: "asc" } }),
  ]);

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={navForRole(user.role)}>
      <CourseSubNav courseId={course.id} active="paper-distribution" code={course.code} title={course.title} status={course.templateStatus} />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Plan the final/mid-term paper's question distribution — pick a topic from your lecture plan to auto-fill
        its CLO and cognitive level, or type a custom one. This is your plan; the Instructor keeps their own copy
        for the actual exam.
      </p>
      <PaperDistributionManager
        apiBase={`/api/subjectexpert/courses/${course.id}/paper-distribution`}
        items={items.map((i) => ({ id: i.id, questionNo: i.questionNo, lectureRowId: i.lectureRowId, topicText: i.topicText, cloId: i.cloId, cognitiveLevel: i.cognitiveLevel, marks: i.marks }))}
        lectureRows={lectureRows.map((r) => ({ id: r.id, topic: r.topic, cloId: r.cloId, bloomLevel: r.bloomLevel }))}
        clos={clos.map((c) => ({ id: c.id, code: c.code, statement: c.statement }))}
      />
    </Shell>
  );
}
