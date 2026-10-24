import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel } from "../../../../lib/reportScope";
import Shell from "../../../../components/Shell";
import { prisma } from "../../../../lib/db";
import CourseTypeBoard from "../../../../components/CourseTypeBoard";
import { canEditMeta } from "../../../../lib/curriculumLibraryData";
import { POLICY_DEFAULTS } from "../../../../lib/quality";

export const dynamic = "force-dynamic";
export const metadata = { title: "Course types" };

export default async function CourseTypes({ params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const c = await prisma.masterCurriculum.findUnique({ where: { id: params.id }, select: { id: true, title: true, version: true, authority: true, chairmanId: true, courses: { select: { id: true, code: true, title: true, creditHours: true, category: true, semesterNumber: true, domain: true } } } });
  if (!c) notFound();
  if (!(await canEditMeta(user, c))) redirect(`/curricula/${c.id}`);
  return (
    <Shell roleLabel={user.role === "SUPER_USER" ? "Super User" : roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <p className="small-note" style={{ margin: 0 }}><Link href={`/curricula/${c.id}`}>← {c.title} {c.version}</Link>{user.role === "SUPER_USER" && <> · <Link href={`/admin/curricula/${c.id}`}>Full editor (CLOs, topics)</Link></>}</p>
      <h1 style={{ fontSize: 22, margin: "4px 0" }}>Course types — {c.title} <span style={{ fontWeight: 400 }}>{c.authority} {c.version}</span></h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Put every course under its type: General Education, Interdisciplinary, Core, Lab, Elective, Capstone, Internship. <b>Elective</b> and <b>IDS</b> are <b>slots</b> — places in the scheme with credit hours and a semester (Elective-I, 3 CH, semester 6). The <b>lists</b> of courses a student may choose for those slots go under “list of options”: a list is just a list, its courses are not added to the credit hours. Checks follow the HEC Undergraduate Education Policy limits.</p>
      <CourseTypeBoard curriculumId={c.id} courses={c.courses} rules={POLICY_DEFAULTS} />
    </Shell>
  );
}
