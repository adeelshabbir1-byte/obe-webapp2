import { prisma } from "./db";
import { getAuthenticatedUser } from "./session";
import { deptScope } from "./omcScope";

// Content Sync is the OMC's page; a Program Lead also uses it for their own batches (step 5 of a batch's set-up). The
// OMC keeps full access. A Program Lead sees only their own batches and may link, unlink or re-base only when every
// course involved is one of their own.

export type SyncCtx = { user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>; chairmanId: string; isOmc: boolean; coordinatorIds: string[] };

export async function syncContext(): Promise<SyncCtx | null> {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return null;
  if (user.role === "OMC") {
    const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "", ...deptScope(user) }, select: { id: true } });
    return { user, chairmanId: user.managedById || "", isOmc: true, coordinatorIds: coordinators.map((c) => c.id) };
  }
  if (user.role === "PROGRAM_COORDINATOR" && user.managedById) return { user, chairmanId: user.managedById, isOmc: false, coordinatorIds: [user.id] };
  return null;
}

/** May this person change links between these courses? (The OMC always; a Program Lead only for their own courses.) */
export async function mayTouch(ctx: SyncCtx, courseIds: string[]) {
  if (ctx.isOmc) return true;
  const ids = Array.from(new Set(courseIds.filter(Boolean)));
  if (!ids.length) return false;
  const n = await prisma.course.count({ where: { id: { in: ids }, coordinatorId: ctx.user.id } });
  return n === ids.length;
}

/** Every member of a group (for the checks above). */
export async function groupCourseIds(groupId: string) {
  return (await prisma.courseContentSyncMember.findMany({ where: { groupId }, select: { courseId: true } })).map((m) => m.courseId);
}

/** After a Program Lead links a course of a batch in set-up: take the synced course's defaults (semester, SE, plan). */
export async function afterLink(ctx: SyncCtx, courseIds: string[]) {
  const ids = (await prisma.course.findMany({ where: { id: { in: courseIds.concat("none") }, coordinatorId: { in: ctx.coordinatorIds } }, select: { id: true, batchId: true } })).filter((c) => c.batchId);
  if (!ids.length) return;
  const { applySyncDefaults } = await import("./batchFlow");
  await db().batchCourseNew.deleteMany({ where: { courseId: { in: ids.map((c) => c.id) } } }).catch(() => null);
  await applySyncDefaults(ids.map((c) => c.id), ctx.user.id).catch(() => null);
}
const db = () => prisma as unknown as Record<string, any>;
