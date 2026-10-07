import { cookies, headers } from "next/headers";
import { isDeptCoordinatorPath } from "./deptCoordinator";
import crypto from "crypto";
import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { assignerHatActive } from "./assignerHat";

const SESSION_COOKIE = "session_token";
const SESSION_TTL_DAYS = 7;

export async function createSession(userId: string, ip?: string, userAgent?: string, mfaVerified = true) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({ data: { userId, tokenHash, expiresAt, ipAddress: ip, userAgent, mfaVerified } });

  cookies().set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function markSessionMfaVerified() {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return false;
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  const result = await prisma.session.updateMany({ where: { tokenHash }, data: { mfaVerified: true } });
  return result.count > 0;
}

export async function destroySession() {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (raw) {
    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
    await prisma.session.updateMany({ where: { tokenHash }, data: { revokedAt: new Date() } });
  }
  cookies().delete(SESSION_COOKIE);
}

export async function getAuthenticatedUser() {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  const session = await prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

  const { passwordHash, ...safeUser } = session.user;
  // A dual-capable Subject Expert's chosen role for this session overrides
  // their stored role everywhere else in the app checks `user.role` —
  // rawRole/secondaryRole stay available for the few places (onboarding,
  // the choice screen itself, dropdowns) that need the true picture.
  // A teacher given the Course Assigner role for this semester gets it as an extra hat while it lasts.
  let assignerHat = false;
  let instituteHeadId = "";
  if (safeUser.assignerTerm && safeUser.role !== "COURSE_ASSIGNER") {
    instituteHeadId = await chairmanIdFor(safeUser);
    assignerHat = await assignerHatActive(safeUser.assignerTerm, instituteHeadId);
  }
  let effectiveRole = session.activeRole || safeUser.role;
  if (effectiveRole === "COURSE_ASSIGNER" && safeUser.role !== "COURSE_ASSIGNER" && !assignerHat) effectiveRole = safeUser.role; // the semester ended
  const base = { ...safeUser, role: effectiveRole, rawRole: safeUser.role, roleChosen: !!session.activeRole, mfaVerified: session.mfaVerified, actingForId: session.actingForId || null, actingAsLead: false, realUserId: safeUser.id, assignerHat };
  // The assigner pages find the institute through managedById, so a teacher wearing this hat is placed directly under the Institute Head.
  if (effectiveRole === "COURSE_ASSIGNER" && safeUser.role !== "COURSE_ASSIGNER") return { ...base, managedById: instituteHeadId };

  // A department Program Coordinator who has picked a program works as that program's coordinator, but only on the pages
  // that involve people, calendars and the timetable. Everywhere else they remain a plain department coordinator.
  if (effectiveRole === "DEPARTMENT_COORDINATOR" && session.actingForId) {
    let path = "";
    try { path = headers().get("x-pathname") || ""; } catch { path = ""; }
    if (path && isDeptCoordinatorPath(path)) {
      const target = await prisma.user.findFirst({ where: { id: session.actingForId, role: "PROGRAM_COORDINATOR", departmentId: safeUser.departmentId, managedById: safeUser.managedById } });
      if (target) {
        const { passwordHash: _ph, ...t } = target;
        return { ...t, mustChangePassword: safeUser.mustChangePassword, role: "PROGRAM_COORDINATOR" as typeof effectiveRole, rawRole: safeUser.role, roleChosen: true, mfaVerified: session.mfaVerified, actingForId: session.actingForId, actingAsLead: true, realUserId: safeUser.id, assignerHat };
      }
    }
  }
  return base;
}

/** Called from the role-choice screen once a dual-capable person picks
 * which role to act as for this session. */
export async function setActiveRole(role: string) {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return false;
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  const result = await prisma.session.updateMany({ where: { tokenHash }, data: { activeRole: role } });
  return result.count > 0;
}

/** The department coordinator picks which program (which Program Lead's data) they are working on. */
export async function setActingFor(coordinatorId: string | null) {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return false;
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  const result = await prisma.session.updateMany({ where: { tokenHash }, data: { actingForId: coordinatorId } });
  return result.count > 0;
}
