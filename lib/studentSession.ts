import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { instituteOfBatch, lockedModuleForPath } from "./moduleLocks";
import crypto from "crypto";
import { prisma } from "./db";

// Deliberately a different cookie name and a fully separate table from
// staff sessions (lib/session.ts) — see the schema comment on
// StudentSession for why this stays fully independent rather than
// extending the staff Session/User models.
const STUDENT_SESSION_COOKIE = "student_session_token";
const SESSION_TTL_DAYS = 30; // students log in far less often than staff; longer TTL avoids nagging re-logins mid-registration

export async function createStudentSession(studentId: string, ip?: string, userAgent?: string) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.studentSession.create({ data: { studentId, tokenHash, expiresAt, ipAddress: ip, userAgent } });

  cookies().set(STUDENT_SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroyStudentSession() {
  const raw = cookies().get(STUDENT_SESSION_COOKIE)?.value;
  if (raw) {
    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
    await prisma.studentSession.updateMany({ where: { tokenHash }, data: { revokedAt: new Date() } });
  }
  cookies().delete(STUDENT_SESSION_COOKIE);
}

export async function getAuthenticatedStudent() {
  const raw = cookies().get(STUDENT_SESSION_COOKIE)?.value;
  if (!raw) return null;

  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  const session = await prisma.studentSession.findUnique({
    where: { tokenHash },
    include: { student: { include: { batch: { select: { degreeProgram: true, batchName: true } } } } },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

  const { passwordHash, ...safeStudent } = session.student;
  // A student who left, was dropped, froze, transferred out or was rusticated keeps read-only access (transcript, fees):
  // nothing can be changed, and once the institute's access period ends the portal is closed (lib/studentStatus.ts).
  if (["LEFT", "DROPPED", "FROZEN", "TRANSFERRED", "RUSTICATED"].includes(session.student.status)) {
    let method = "GET", p = "";
    try { method = headers().get("x-method") || "GET"; p = headers().get("x-pathname") || ""; } catch { /* outside a request */ }
    if (method !== "GET" && !/^\/api\/student\/(logout|login)/.test(p)) return null;
    const acc = await (prisma as unknown as Record<string, any>).studentAccess?.findUnique({ where: { studentId: session.student.id } }).catch(() => null);
    if (acc?.readOnlyUntil && new Date(acc.readOnlyUntil) < new Date()) return null;
  }
  // Licensing: student pages of a module the institute has not bought are closed.
  let reqPath = "";
  try { reqPath = headers().get("x-pathname") || ""; } catch { reqPath = ""; }
  if (reqPath && session.student.batchId) {
    const locked = await lockedModuleForPath(await instituteOfBatch(session.student.batchId).catch(() => null), reqPath).catch(() => null);
    if (locked) { if (reqPath.startsWith("/api/")) return null; redirect(`/student/dashboard?locked=${locked}`); }
  }
  return safeStudent;
}
