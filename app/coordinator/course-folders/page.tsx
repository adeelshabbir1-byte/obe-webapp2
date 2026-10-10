import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CourseFolderManager from "../../../components/CourseFolderManager";
import { navForRole } from "../../../components/reportNav";


export default async function CourseFoldersPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");
  const courses = await prisma.course.findMany({ where: { coordinatorId: user.id, isOffered: true }, include: { batch: true }, orderBy: { code: "asc" } });
  const folders = await prisma.courseFolder.findMany({ where: { coordinatorId: user.id } });
  const by = new Map(folders.map((f) => [f.courseId, f]));
  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course Folders</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>Tick each offered course whose folder (hard copy or on the LMS) is kept: outline, CLOs, lecture plan, papers, marked scripts and results. The visiting team samples these.</p>
      <CourseFolderManager rows={courses.map((c) => ({ id: c.id, code: c.code, title: c.title, batch: c.batch ? c.batch.batchName : "—", kept: by.get(c.id)?.kept || false, note: by.get(c.id)?.note || "" }))} />
    </Shell>
  );
}
