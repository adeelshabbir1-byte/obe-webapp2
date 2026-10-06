import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";

export default async function MasterDesignHome() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUBJECT_EXPERT" || !user.isPlatformExpert) redirect("/dashboard");

  const courses = await prisma.masterCourse.findMany({
    where: { designerId: user.id, masterCurriculum: { chairmanId: null } },
    include: { masterCurriculum: { select: { title: true, version: true } }, seedClos: { select: { id: true } }, seedTopics: { select: { id: true } } },
    orderBy: [{ masterCurriculumId: "asc" }, { semesterNumber: "asc" }, { code: "asc" }],
  });

  return (
    <Shell roleLabel="Master Curriculum Expert" userName={user.name} navLinks={[{ href: "/master-design", label: "My Master Courses" }]}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My Master Courses</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Courses assigned to you by the platform administrator. What you write here — description, books, CLOs and the lecture plan — becomes the starting
        point for this course at every institute that adopts the Master Curriculum.
      </p>
      <div className="card">
        <table>
          <thead><tr><th>Course</th><th>Curriculum</th><th>Credits</th><th>CLOs</th><th>Lecture topics</th><th></th></tr></thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No courses have been assigned to you yet.</td></tr>}
            {courses.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.code}</strong> — {c.title}</td>
                <td style={{ fontSize: 12 }}>{c.masterCurriculum.title} ({c.masterCurriculum.version})</td>
                <td>{c.creditHours}</td><td>{c.seedClos.length}</td><td>{c.seedTopics.length}</td>
                <td><Link href={`/master-design/${c.id}`}>Design →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
