import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { namerOf } from "../../../lib/seNaming";
import { notifyUsers } from "../../../lib/notifications";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// POST { courseId } — "Request SE" (Adeel prompt §12): a Program Lead asks whoever names the SE of a department-common or
// service course (the HOD of its home department) to name one.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = String(((await req.json().catch(() => ({}))) as { courseId?: string }).courseId || "");
  const course = await prisma.course.findUnique({ where: { id }, select: { id: true, code: true, title: true, coordinatorId: true } });
  if (!course || course.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  const n = await namerOf(await chairmanIdFor(user as never), course);
  if (n.kind !== "HOD" || !n.departmentId) return NextResponse.json({ error: "You name this course's Subject Expert yourself." }, { status: 400 });
  const hods = await prisma.user.findMany({ where: { role: "HEAD_OF_DEPARTMENT", departmentId: n.departmentId, isActive: true }, select: { id: true } });
  if (!hods.length) return NextResponse.json({ error: `No HOD is set for that department yet.` }, { status: 409 });
  await notifyUsers(hods.map((h) => h.id), { kind: "SE_REQUEST", title: `SE needed: ${course.code} ${course.title}`, body: `${user.name} asks you to name the Subject Expert.`, href: "/hod/assign-subject-experts" });
  return NextResponse.json({ ok: true, sentTo: hods.length });
}
export const POST = withErrors(POST_handler);
