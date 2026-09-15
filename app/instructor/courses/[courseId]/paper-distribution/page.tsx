import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import PaperDistributionManager from "../../../../../components/PaperDistributionManager";
import { navForRole } from "../../../../../components/reportNav";


export default async function InstructorPaperDistributionPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course || course.instructorId !== user.id) notFound();

  const [items, lectureRows, clos] = await Promise.all([
    prisma.paperDistributionItem.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { orderIndex: "asc" } }),
    prisma.lectureRow.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { lectureNumber: "asc" } }),
    prisma.cLO.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { orderIndex: "asc" } }),
  ]);

  // Cross-reference each question's topic against what was ACTUALLY
  // delivered — how many lectures it really got, and whether any of them
  // have happened yet — so the exam can be checked against real coverage,
  // not just the plan.
  const normalize = (t: string) => t.trim().toLowerCase();
  const coverageByTopic = new Map<string, { lectureCount: number; covered: boolean; deliveredMarksPct: number }>();
  for (const r of lectureRows) {
    const key = normalize(r.topic);
    const entry = coverageByTopic.get(key) || { lectureCount: 0, covered: false, deliveredMarksPct: 0 };
    entry.lectureCount++;
    entry.deliveredMarksPct += r.weightPct;
    if (r.actualDate) entry.covered = true;
    coverageByTopic.set(key, entry);
  }

  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={navForRole(user.role)}>
      <InstructorCourseSubNav courseId={course.id} active="paper-distribution" code={course.code} title={course.title} />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Build the actual exam's question distribution — pick a topic from your delivered lecture content to
        auto-fill its CLO and cognitive level, or type a custom one. Each question is checked against what was
        actually covered in class.
      </p>
      <PaperDistributionManager
        apiBase={`/api/instructor/courses/${course.id}/paper-distribution`}
        items={items.map((i) => ({ id: i.id, questionNo: i.questionNo, lectureRowId: i.lectureRowId, topicText: i.topicText, cloId: i.cloId, cognitiveLevel: i.cognitiveLevel, marks: i.marks }))}
        lectureRows={lectureRows.map((r) => ({ id: r.id, topic: r.topic, cloId: r.cloId, bloomLevel: r.bloomLevel }))}
        clos={clos.map((c) => ({ id: c.id, code: c.code, statement: c.statement }))}
        coverageByTopic={Object.fromEntries(coverageByTopic.entries())}
      />
    </Shell>
  );
}
