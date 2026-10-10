import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { verifyPassword } from "../../../../lib/auth";
import { createStudentSession } from "../../../../lib/studentSession";
import { writeAuditLog } from "../../../../lib/audit";

// rollNumber is only unique WITHIN a batch (not institution-wide), so a
// login can genuinely match more than one Student row — try each
// candidate's password rather than assuming the first match is right.
// Never reveal which part (roll number vs. password) was wrong, same
// principle as the staff login in lib/auth.ts's attemptLogin.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const rollNumber = String(body.rollNumber || "").trim();
  const password = String(body.password || "");
  if (!rollNumber || !password) return NextResponse.json({ error: "Roll number and password are required." }, { status: 400 });

  // Roll numbers are guessable and first passwords are the roll number itself, so repeated wrong passwords must stop
  // the guessing: 8 failures in 15 minutes for the same roll number blocks further attempts for a while.
  const recentFails = await prisma.auditLog.count({
    where: { action: "STUDENT_LOGIN_FAILED", createdAt: { gte: new Date(Date.now() - 15 * 60_000) }, metadata: { path: ["rollNumber"], equals: rollNumber } },
  });
  if (recentFails >= 8) return NextResponse.json({ error: "Too many wrong attempts. Please wait 15 minutes and try again." }, { status: 429 });

  const candidates = await prisma.student.findMany({ where: { rollNumber } });
  const genericError = NextResponse.json({ error: "Incorrect roll number or password." }, { status: 401 });

  let matched = null;
  for (const c of candidates) {
    if (!c.passwordHash) continue; // never activated yet
    if (await verifyPassword(c.passwordHash, password)) { matched = c; break; }
  }
  if (!matched) {
    await writeAuditLog({ action: "STUDENT_LOGIN_FAILED", metadata: { rollNumber } });
    return genericError;
  }

  await createStudentSession(matched.id, req.headers.get("x-forwarded-for") || undefined, req.headers.get("user-agent") || undefined);
  await writeAuditLog({ action: "STUDENT_LOGIN_SUCCESS", metadata: { studentId: matched.id, rollNumber } });

  return NextResponse.json({ ok: true, mustChangePassword: matched.mustChangePassword });
}
