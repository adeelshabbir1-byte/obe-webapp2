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
  return (
    <Shell roleLabel="Course Instructor" userName={user.name} navLinks={navForRole(user.role)}>
      <Link href="/instructor/labs" style={{ fontSize: 13, color: "var(--brass-dark)" }}>← My Labs</Link>
      <h1 style={{ fontSize: 22, margin: "6px 0 2px" }}>{access.lab.code} — {access.lab.title}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        {access.lab.batch ? `${access.lab.batch.degreeProgram} ${access.lab.batch.batchName}` : "—"} · Lab Engineer: {access.lab.labEngineer?.name || "not named yet"} · Lab lead: {access.lead?.name || "not named yet"}
      </p>
      <LabPlanPanel labCourseId={access.lab.id} as={access.as} theoryCode={access.theory?.code || null} lectures={lectures} tasks={tasks} files={files as never} issues={syncIssues(tasks, lectures, !!access.theory)} />
      <LabWorkspace hideManuals courseId={access.lab.id} as={access.as} theoryCode={access.theory?.code || null} {...data} />
    </Shell>
  );
}
