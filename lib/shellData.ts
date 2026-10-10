import { prisma } from "./db";
import { hatsOf, isDualCapable, DUAL_ROLE_LABEL } from "./dualRoles";
import { requestInboxIds } from "./requests";
import type { getSignedInUser } from "./session";

// What the page chrome (Shell) needs about the signed-in person. These used to live only inside
// API routes that the sidebar called from the browser after every navigation; the routes now call
// the same functions, so the Shell can ask for the data during the page's own server render.

type SignedInUser = NonNullable<Awaited<ReturnType<typeof getSignedInUser>>>;

export type SessionInfo = {
  deptCoordinator: { actingForId: string | null; programs: { id: string; label: string }[] } | null;
  dualCapable: boolean;
  otherRoles: { role: string; label: string }[];
  otherRole: string | null;
  otherRoleLabel: string | null;
  activeRole: string;
  isAlumniCustodian: boolean;
};

export async function getSessionInfo(user: SignedInUser): Promise<SessionInfo> {
  const dualCapable = isDualCapable(user.rawRole, user.secondaryRole, user.assignerHat || user.omcHat);
  // The other roles this person can switch to right now (e.g. a Dean who also teaches and is a Subject Expert).
  const otherRoles = dualCapable ? hatsOf({ ...user, assignerHat: user.assignerHat, omcHat: user.omcHat }).filter((r) => r !== user.role).map((r) => ({ role: r, label: DUAL_ROLE_LABEL[r] || r })) : [];
  // A department Program Coordinator: the programs of their department they can work on.
  let deptCoordinator = null as SessionInfo["deptCoordinator"];
  if (user.role === "DEPARTMENT_COORDINATOR") {
    const leads = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", departmentId: user.departmentId, managedById: user.managedById }, select: { id: true, name: true, leadProgram: true }, orderBy: { name: "asc" } });
    deptCoordinator = { actingForId: user.actingForId, programs: leads.map((l) => ({ id: l.id, label: l.leadProgram ? `${l.leadProgram} (${l.name})` : l.name })) };
  }
  return {
    deptCoordinator, dualCapable, otherRoles, otherRole: otherRoles[0]?.role || null, otherRoleLabel: otherRoles[0]?.label || null,
    activeRole: user.role, isAlumniCustodian: !!user.isAlumniCustodian,
  };
}

/** How many requests need this person: asked of them and still open, or answered and waiting for them to read. */
export async function getRequestsCount(user: SignedInUser): Promise<number> {
  const inbox = await requestInboxIds(user);
  const [incoming, answered] = await Promise.all([
    prisma.taskRequest.count({ where: { toId: { in: inbox }, status: "OPEN" } }),
    prisma.taskRequest.count({ where: { fromId: user.id, status: { in: ["RESPONDED", "DONE"] } } }),
  ]);
  return incoming + answered;
}

/** The "current term" reminder in the sidebar: a Program Lead's own, or — for a department Program
 * Coordinator who has picked a program — that program's (exactly what /api/coordinator/current-term returns to them). */
export async function getSidebarCurrentTerm(user: SignedInUser): Promise<{ termName: string; year: number } | null> {
  let coordinatorId: string | null = null;
  if (user.role === "PROGRAM_COORDINATOR") coordinatorId = user.id;
  else if (user.role === "DEPARTMENT_COORDINATOR" && user.actingForId) {
    const target = await prisma.user.findFirst({ where: { id: user.actingForId, role: "PROGRAM_COORDINATOR", departmentId: user.departmentId, managedById: user.managedById }, select: { id: true } });
    coordinatorId = target?.id || null;
  }
  if (!coordinatorId) return null;
  return prisma.currentTerm.findUnique({ where: { coordinatorId }, select: { termName: true, year: true } });
}
