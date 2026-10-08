import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import ProgramMoves from "../../components/ProgramMoves";

const TEACHING = ["INSTRUCTOR", "SUBJECT_EXPERT", "LAB_ENGINEER"] as ("INSTRUCTOR" | "SUBJECT_EXPERT" | "LAB_ENGINEER")[];

export default async function ProgramMovesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!["HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR"].includes(user.role)) redirect("/dashboard");

  const chairmanId = user.managedById || "";
  const canAsk = user.role !== "PROGRAM_COORDINATOR";

  // Departments this person oversees (Chairman: their own; Dean: those of the faculty).
  let deptIds: string[] = [];
  if (user.role === "HEAD_OF_DEPARTMENT" && user.departmentId) deptIds = [user.departmentId];
  if (user.role === "DEAN" && user.facultyId) deptIds = (await prisma.department.findMany({ where: { chairmanId, facultyId: user.facultyId }, select: { id: true } })).map((d) => d.id);

  const leadsRaw = canAsk
    ? await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId, departmentId: { in: deptIds } }, select: { id: true, name: true, leadProgram: true, departmentId: true } })
    : [];
  const leads = leadsRaw.map((l) => ({ id: l.id, label: l.leadProgram ? `${l.leadProgram} (${l.name})` : l.name, departmentId: l.departmentId || "" }));
  const teachersRaw = canAsk && leadsRaw.length > 0
    ? await prisma.user.findMany({ where: { role: { in: TEACHING }, isVisitingPlaceholder: false, managedById: { in: leadsRaw.map((l) => l.id) } }, select: { id: true, name: true, managedById: true }, orderBy: { name: "asc" } })
    : [];
  const teachers = teachersRaw.map((t) => { const l = leads.find((x) => x.id === t.managedById); return { id: t.id, name: t.name, fromId: t.managedById || "", fromLabel: l?.label || "—", departmentId: l?.departmentId || "" }; });

  const movesRaw = await prisma.teacherProgramMove.findMany({
    where: user.role === "PROGRAM_COORDINATOR" ? { OR: [{ fromCoordinatorId: user.id }, { toCoordinatorId: user.id }] } : { chairmanId, OR: [{ requestedById: user.id }, { fromCoordinatorId: { in: leads.map((l) => l.id) } }] },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  const ids = Array.from(new Set<string>(movesRaw.flatMap((m) => [m.teacherId, m.fromCoordinatorId, m.toCoordinatorId, m.requestedById])));
  const people = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, leadProgram: true } });
  const nm = (id: string) => people.find((p) => p.id === id)?.name || "—";
  const lead = (id: string) => { const p = people.find((x) => x.id === id); return p ? (p.leadProgram ? `${p.leadProgram} (${p.name})` : p.name) : "—"; };
  const moves = movesRaw.map((m) => ({
    id: m.id, teacher: nm(m.teacherId), from: lead(m.fromCoordinatorId), to: lead(m.toCoordinatorId), fromId: m.fromCoordinatorId, toId: m.toCoordinatorId,
    fromStatus: m.fromStatus, toStatus: m.toStatus, status: m.status, by: nm(m.requestedById), requestedById: m.requestedById, note: m.note, at: m.createdAt.toISOString().slice(0, 10),
  }));

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Teacher Program Moves</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        A teacher belongs to one program. A Chairman or Dean can ask to move a teacher to another program of the same department. Both Program Leads must accept before the teacher moves.
      </p>
      <ProgramMoves canAsk={canAsk} myId={user.id} teachers={teachers} leads={leads} moves={moves} />
    </Shell>
  );
}
