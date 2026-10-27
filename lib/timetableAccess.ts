import { prisma } from "./db";
import { getAuthenticatedUser } from "./session";
import { timetableScopeFor, type TimetableScope } from "./timetableScope";

// Who works on the department timetable.
//  - The Department Coordinator owns it: one timetable for every program and batch of the department (the shared scope
//    when the department is on the shared timetable, otherwise only its own programs and rooms).
//  - A Program Lead sees it read-only, filtered to their own batches — unless the department has no Department
//    Coordinator, in which case the Program Lead still sets it up and generates it (small departments keep working).

export type TimetableActor = {
  user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>;
  chairmanId: string;
  scope: TimetableScope;
  canEdit: boolean;
  isDeptCoordinator: boolean;
  ownBatchIds: string[] | null; // a Program Lead's own batches (for the read-only filter); null = the whole scope
  editorName: string | null; // who edits it when this person can't
};

export async function departmentCoordinators(chairmanId: string, departmentId: string | null) {
  if (!departmentId) return [];
  return prisma.user.findMany({
    where: { isActive: true, departmentId, managedById: chairmanId, OR: [{ role: "DEPARTMENT_COORDINATOR" }, { secondaryRole: "DEPARTMENT_COORDINATOR" }, { tertiaryRole: "DEPARTMENT_COORDINATOR" }] } as never,
    select: { id: true, name: true },
  });
}

export async function timetableActor(): Promise<TimetableActor | null> {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return null;
  const chairmanId = user.managedById || "";
  if (user.role === "DEPARTMENT_COORDINATOR") {
    return { user, chairmanId, scope: await timetableScopeFor(user), canEdit: true, isDeptCoordinator: true, ownBatchIds: null, editorName: null };
  }
  if (user.role === "PROGRAM_COORDINATOR") {
    const [scope, dcs, own] = await Promise.all([
      timetableScopeFor(user),
      departmentCoordinators(chairmanId, user.departmentId || null),
      prisma.batch.findMany({ where: { coordinatorId: user.id }, select: { id: true } }),
    ]);
    return { user, chairmanId, scope, canEdit: dcs.length === 0, isDeptCoordinator: false, ownBatchIds: own.map((b) => b.id), editorName: dcs.map((d) => d.name).join(", ") || null };
  }
  return null;
}

/** Every batch on this timetable. */
export async function scopeBatches(scope: TimetableScope) {
  return prisma.batch.findMany({ where: { coordinatorId: { in: scope.coordinatorIds.concat("none") } }, include: { scheduleConfig: true } });
}

/** Teachers who can appear on this timetable: everyone the scope's Program Leads manage, the leads themselves, and
 *  anyone already teaching one of its sections (e.g. a teacher borrowed from another department). */
export async function scopeFaculty(scope: TimetableScope) {
  const batchIds = (await prisma.batch.findMany({ where: { coordinatorId: { in: scope.coordinatorIds.concat("none") } }, select: { id: true } })).map((b) => b.id);
  const teaching = await prisma.scheduleSection.findMany({ where: { OR: [{ course: { batchId: { in: batchIds.concat("none") } } }, { group: { members: { some: { course: { batchId: { in: batchIds.concat("none") } } } } } }] }, select: { instructorId: true } });
  return prisma.user.findMany({
    where: { isVisitingPlaceholder: false, OR: [{ managedById: { in: scope.coordinatorIds.concat("none") }, role: { in: ["SUBJECT_EXPERT", "INSTRUCTOR"] } }, { id: { in: Array.from(new Set(teaching.map((t) => t.instructorId))).concat(scope.coordinatorIds) } }] } as never,
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
}

export const READ_ONLY = (a: TimetableActor) => `The department timetable is run by the Department Coordinator${a.editorName ? ` (${a.editorName})` : ""}. You can see it, filtered to your batches; ask them for changes.`;
