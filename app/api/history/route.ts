import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import { historyOf } from "../../../lib/changeHistory";
import { chairmanIdFor } from "../../../lib/reportScope";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// GET ?type=CLO&id=… — a record's change history (who · when · old → new), read-only (Adeel prompt §3).
// Shown to staff of the record's institute; marks history only to the teacher, HOD and Controller.
const COURSE_OF: Record<string, (id: string) => Promise<string | null>> = {
  CLO: async (id) => (await prisma.cLO.findUnique({ where: { id }, select: { courseId: true } }))?.courseId || null,
  LectureRow: async (id) => (await prisma.lectureRow.findUnique({ where: { id }, select: { courseId: true } }))?.courseId || null,
  Course: async (id) => id,
};
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const type = String(req.nextUrl.searchParams.get("type") || ""), id = String(req.nextUrl.searchParams.get("id") || "");
  if (!type || !id) return NextResponse.json({ error: "Which record?" }, { status: 400 });
  const courseOf = COURSE_OF[type];
  if (user.role !== "SUPER_USER" && courseOf) {
    const cid = await courseOf(id).catch(() => null);
    const course = cid ? await prisma.course.findUnique({ where: { id: cid }, select: { instructorId: true, coordinator: { select: { id: true, role: true, managedById: true } } } }) : null;
    const theirs = course?.coordinator ? await chairmanIdFor(course.coordinator as never).catch(() => "") : "";
    if (!theirs || theirs !== (await chairmanIdFor(user as never).catch(() => "x"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (type === "Mark" && !(course?.instructorId === user.id || ["HEAD_OF_DEPARTMENT", "CHAIRMAN"].includes(user.role) || ((user as { extraRoles?: string[] }).extraRoles || []).includes("EXAM_CONTROLLER"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (user.role !== "SUPER_USER" && !courseOf && !["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ history: await historyOf(type, id) });
}
export const GET = withErrors(GET_handler);
