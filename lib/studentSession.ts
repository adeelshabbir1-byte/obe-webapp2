import { cookies } from "next/headers";
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
  return safeStudent;
}
