import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";
import { loadTeams } from "../../../lib/courseTeams";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import CourseTeamPanel, { TeamPanelView } from "../../../components/CourseTeamPanel";

export default async function CourseTeamPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");

  const chairmanId = await chairmanIdFor(user);
  const mine = (await loadTeams(chairmanId)).filter((t) => t.teachers.some((x) => x.id === user.id));
  const subs = await prisma.paperSubmission.findMany({ where: { chairmanId, teamKey: { in: mine.map((t) => t.key) } }, include: { approvals: true } });
  const names = new Map<string, string>(mine.flatMap((t) => t.teachers.map((x) => [x.id, x.name] as [string, string])));

  const views: TeamPanelView[] = [];
  for (const t of mine) {
    const iAmLead = t.leadId === user.id;
    const leadRow = iAmLead ? t.rows.find((r) => r.teachers.some((x) => x.id === user.id)) : null;
    const exams = [];
    for (const examType of ["Midterm", "Final"]) {
      const sub = subs.find((s) => s.teamKey === t.key && s.examType === examType) || null;
      const itemCourse = iAmLead ? leadRow?.courseId : sub?.leadCourseId;
      const items = itemCourse ? await prisma.paperDistributionItem.findMany({ where: { courseId: itemCourse, source: "INSTRUCTOR", examType }, orderBy: { orderIndex: "asc" }, include: { clo: { select: { code: true } } } }) : [];
      const mineApproval = sub?.approvals.find((a) => a.userId === user.id) || null;
      exams.push({
        examType, status: sub?.status || null, version: sub?.version || null, itemCount: items.length, submissionId: sub?.id || null,
        items: items.map((i) => ({ questionNo: i.questionNo, topic: i.topicText, clo: i.clo?.code || null, level: i.cognitiveLevel, marks: i.marks })),
        reviews: (sub?.approvals || []).map((a) => ({ name: names.get(a.userId) || "Teacher", status: a.status, note: a.note })),
        myReview: mineApproval ? { status: mineApproval.status, note: mineApproval.note } : null,
      });
    }
    views.push({
      key: t.key, code: t.code, title: t.title, term: t.term, leadName: t.leadId ? names.get(t.leadId) || null : null, iAmLead,
      leadCourseId: leadRow?.courseId || null, exams, others: t.teachers.filter((x) => x.id !== user.id).map((x) => x.name),
    });
  }

  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course Teams</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Courses you teach together with other teachers. The Course Lead finalises the Midterm and Final paper and sends it to the others, who approve it or ask for changes.
        When everyone approves, every section receives the approved paper.
      </p>
      <CourseTeamPanel teams={views} />
    </Shell>
  );
}
