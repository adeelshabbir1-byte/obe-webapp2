import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";
import { createExit, employeeKind, appBase } from "../../../lib/exitSurveys";
import { withErrors } from "../../../lib/apiHandler";

// Send an exit survey by hand: to a student (roll number) or an employee.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !["CHAIRMAN", "FINANCE_OFFICER", "STUDENT_AFFAIRS", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = await chairmanIdFor(user);
  const b = await req.json().catch(() => ({}));
  try {
    if (b.rollNumber) {
      const st = await prisma.student.findFirst({ where: { rollNumber: String(b.rollNumber).trim(), batch: { coordinator: { managedById: cid } } }, select: { id: true, name: true } });
      if (!st) return NextResponse.json({ error: "Student not found." }, { status: 404 });
      return NextResponse.json({ ok: true, link: appBase() + (await createExit(cid, "STUDENT_EXIT", st.id, st.name, user.id)) });
    }
    const u = await prisma.user.findFirst({ where: { id: String(b.userId || ""), OR: [{ managedById: cid }, { managedBy: { managedById: cid } }] }, select: { id: true, name: true, role: true } });
    if (!u) return NextResponse.json({ error: "Choose an employee." }, { status: 404 });
    return NextResponse.json({ ok: true, link: appBase() + (await createExit(cid, employeeKind(u.role), u.id, u.name, user.id)) });
  } catch { return NextResponse.json({ error: "Run prisma/migration_visit_extras.sql first." }, { status: 500 }); }
}
export const POST = withErrors(POST_handler);
