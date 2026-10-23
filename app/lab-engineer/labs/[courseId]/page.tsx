import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import { labAccessFor } from "../../../../lib/labAccess";
import { labWorkspaceData } from "../../../../lib/labData";
import Shell from "../../../../components/Shell";
import { navForRole } from "../../../../components/reportNav";
import LabWorkspace from "../../../../components/LabWorkspace";
import LabPlanPanel from "../../../../components/LabPlanPanel";
import { checkLabSync, labFiles, labTasks, syncIssues, theoryLectures } from "../../../../lib/labPlan";
import LabSessionsEditor from "../../../../components/LabSessionsEditor";
import { labSessions, labCloOptions } from "../../../../lib/labSessions";
import { templateCriteria } from "../../../../lib/rubrics";
import LabTheoryPanel from "../../../../components/LabTheoryPanel";
import { labStatus } from "../../../../lib/labTheory";
import { prisma } from "../../../../lib/db";

export default async function LabDetail({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const access = await labAccessFor(user, params.courseId);
  if (!access) notFound();
  await checkLabSync(access.lab.id, { id: user.id, name: user.name }).catch(() => {}); // catches lecture-plan changes made anywhere
  const data = await labWorkspaceData(access.lab, access.theory, access.as, user.id);
  const [lectures, tasks, files] = await Promise.all([theoryLectures(access.theory?.id || null), labTasks(access.lab.id), labFiles(access.lab.id)]);
  const st = await labStatus(access.lab.id, access.theory?.id || null);
  const approver = st.setting.approvedById ? await prisma.user.findUnique({ where: { id: st.setting.approvedById }, select: { name: true } }) : null;
  return (
    <Shell roleLabel="Lab Engineer" userName={user.name} navLinks={navForRole(user.role)}>
      <Link href="/lab-engineer/labs" style={{ fontSize: 13, color: "var(--brass-dark)" }}>← My Labs</Link>
      <h1 style={{ fontSize: 22, margin: "6px 0 2px" }}>{access.lab.code} — {access.lab.title}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        {access.lab.batch ? `${access.lab.batch.degreeProgram} ${access.lab.batch.batchName}` : "—"} · Lab Engineer: {access.lab.labEngineer?.name || "not named yet"} · Lab lead: {access.lead?.name || "not named yet"}
      </p>
      <LabTheoryPanel labCourseId={access.lab.id} theoryCode={access.theory?.code || null} as={access.as} canSet={access.as === "LEAD"} status={{ sessions: st.sessions, manualsApproved: st.manualsApproved, manualsWaiting: st.manualsWaiting, manualsMissing: st.manualsMissing, held: st.held, marks: st.marks, attendance: st.attendance, issues: st.issues.length, badIssues: st.issues.filter((i) => i.level === "bad").length }} setting={{ intoTheory: st.setting.intoTheory, weightPct: st.setting.weightPct, approvedAt: st.setting.approvedAt ? new Date(st.setting.approvedAt).toISOString() : null, approvedBy: approver?.name || null, changeRequest: st.setting.changeRequest, ready: st.setting.ready }} />
      <LabSessionsEditor labCourseId={access.lab.id} sessions={await labSessions(access.lab.id)} clos={(await labCloOptions(access.lab.id, access.theory?.id || null)).map((c) => ({ id: c.id, code: c.code }))} template={templateCriteria("Lab")} />
      <LabPlanPanel labCourseId={access.lab.id} as={access.as} theoryCode={access.theory?.code || null} lectures={lectures} tasks={tasks} files={files as never} issues={syncIssues(tasks, lectures, !!access.theory)} />
      <LabWorkspace hideManuals courseId={access.lab.id} as={access.as} theoryCode={access.theory?.code || null} {...data} />
    </Shell>
  );
}
