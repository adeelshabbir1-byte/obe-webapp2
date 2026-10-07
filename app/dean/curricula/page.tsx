import { prisma } from "../../../lib/db";
import { requireDean } from "../../../lib/deanGuard";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import { DeanCurriculumDecisions } from "../../../components/DeanDecisions";

export default async function DeanCurriculaPage() {
  const user = await requireDean();
  const [curricula, approvals] = await Promise.all([
    prisma.masterCurriculum.findMany({ where: { chairmanId: user.managedById || "none" }, orderBy: [{ title: "asc" }, { version: "desc" }] }),
    prisma.curriculumDeanApproval.findMany({ where: { facultyId: user.facultyId || "none" } }),
  ]);
  const by = new Map(approvals.map((a) => [a.curriculumId, a]));
  return (
    <Shell roleLabel="Dean" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Curricula</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Your sign-off on the institute’s curricula for your faculty. Approval is recorded and shown to the Institute Head; returning one asks for changes. It does not lock the curriculum.
      </p>
      <div className="card">
        <DeanCurriculumDecisions items={curricula.map((c) => ({ id: c.id, title: c.title, authority: c.authority, version: c.version, status: by.get(c.id)?.status || null, note: by.get(c.id)?.note || null }))} />
      </div>
    </Shell>
  );
}
