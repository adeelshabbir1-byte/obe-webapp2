import { cache } from "react";
import { cookies, headers } from "next/headers";
import { isDeptCoordinatorPath } from "./deptCoordinator";
import crypto from "crypto";
import { Prisma, type Session, type User } from "@prisma/client";
import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { assignerHatActive } from "./assignerHat";

const SESSION_COOKIE = "session_token";
const SESSION_TTL_DAYS = 7;

// Every User column except the institute logo — a base64 image that used to be read from the
// database on every single signed-in request of an Institute Head. Built from the schema, so a
// column added to User later is included automatically. Nothing reads the logo through the session.
const SESSION_USER_COLUMNS = Object.fromEntries(
  Object.values(Prisma.UserScalarFieldEnum).filter((column) => column !== "instituteLogo").map((column) => [column, true]),
) as Prisma.UserSelect;
type SessionRow = Session & { user: Omit<User, "instituteLogo"> };

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

// The signed-in person, worked out once per request: a page, its Shell and any helper can all ask
// for the current user and the session lookup (and the extra-hat checks) still run only once.
const resolveSelf = cache(async () => {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  const session = (await prisma.session.findUnique({ where: { tokenHash }, include: { user: { select: SESSION_USER_COLUMNS } } })) as unknown as SessionRow | null;

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  // A switched-off account stops working immediately, not when its session expires.
  if (session.user.isActive === false) return null;

  // A session that has passed the password but not the second step (authenticator code) may only call the few
  // sign-in endpoints. Pages redirect such a session to the code screen, but the API must refuse it outright,
  // otherwise anyone who knows a password could skip two-step verification by calling the API directly.
  if (!session.mfaVerified) {
    let apiPath = "";
    try { apiPath = headers().get("x-pathname") || ""; } catch { apiPath = ""; }
    const allowed = ["/api/auth/mfa-verify", "/api/auth/logout", "/api/auth/change-password"];
    if (apiPath.startsWith("/api/") && !allowed.includes(apiPath)) return null;
  }

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
  // A faculty member who also sits on the OMC.
  const omcHat = !!safeUser.omcHat && safeUser.role !== "OMC";
  if (omcHat && !instituteHeadId) instituteHeadId = await chairmanIdFor(safeUser);
  // The role chosen at sign-in only counts while the person still holds it; a stale choice (for example Instructor, kept
  // from before they were given a coordinator role) is ignored so the role choice is offered again.
  const heldRoles = [safeUser.role, safeUser.secondaryRole, safeUser.tertiaryRole, ...((safeUser as { extraRoles?: string[] }).extraRoles || []), assignerHat ? "COURSE_ASSIGNER" : null, omcHat ? "OMC" : null];
  const chosenRole = session.activeRole && heldRoles.includes(session.activeRole) ? session.activeRole : null;
  let effectiveRole = chosenRole || safeUser.role;
  if (effectiveRole === "COURSE_ASSIGNER" && safeUser.role !== "COURSE_ASSIGNER" && !assignerHat) effectiveRole = safeUser.role; // the semester ended
  if (effectiveRole === "OMC" && safeUser.role !== "OMC" && !omcHat) effectiveRole = safeUser.role;
  const base = { ...safeUser, role: effectiveRole, rawRole: safeUser.role, roleChosen: !!chosenRole, mfaVerified: session.mfaVerified, actingForId: session.actingForId || null, actingAsLead: false, realUserId: safeUser.id, assignerHat, omcHat };
  // The assigner pages find the institute through managedById, so a teacher wearing this hat is placed directly under the Institute Head.
  const self = (effectiveRole === "COURSE_ASSIGNER" && safeUser.role !== "COURSE_ASSIGNER") || (effectiveRole === "OMC" && safeUser.role !== "OMC") ? { ...base, managedById: instituteHeadId } : base;
  return { self, base, safeUser, session, effectiveRole, assignerHat, omcHat };
});

/** The signed-in person themselves — never swapped for the Program Lead a department coordinator is working as.
 * This is what the sign-in API routes have always seen; the page chrome (Shell) uses it for the same reason. */
export const getSignedInUser = cache(async () => (await resolveSelf())?.self ?? null);

export const getAuthenticatedUser = cache(async () => {
  const resolved = await resolveSelf();
  if (!resolved) return null;
  const { self, base, safeUser, session, effectiveRole, assignerHat, omcHat } = resolved;
  if (self !== base) return self;

  // A department Program Coordinator who has picked a program works as that program's coordinator, but only on the pages
  // that involve people, calendars and the timetable. Everywhere else they remain a plain department coordinator.
  if (effectiveRole === "DEPARTMENT_COORDINATOR" && session.actingForId) {
    let path = "";
    try { path = headers().get("x-pathname") || ""; } catch { path = ""; }
    if (path && isDeptCoordinatorPath(path)) {
      const target = await prisma.user.findFirst({ where: { id: session.actingForId, role: "PROGRAM_COORDINATOR", departmentId: safeUser.departmentId, managedById: safeUser.managedById } });
      if (target) {
        const { passwordHash: _ph, ...t } = target;
        return { ...t, mustChangePassword: safeUser.mustChangePassword, role: "PROGRAM_COORDINATOR" as typeof effectiveRole, rawRole: safeUser.role, roleChosen: true, mfaVerified: session.mfaVerified, actingForId: session.actingForId, actingAsLead: true, realUserId: safeUser.id, assignerHat, omcHat };
      }
    }
  }
  return base;
});

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
