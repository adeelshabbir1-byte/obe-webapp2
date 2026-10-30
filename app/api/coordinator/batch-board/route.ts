import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { setOwner } from "../../../../lib/universityCurriculum";
import { withErrors } from "../../../../lib/apiHandler";

// POST { action: move | owner, courseId, type?, semester? } — Program Lead on the batch board.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const c = await prisma.course.findFirst({ where: { id: String(b.courseId || ""), coordinatorId: user.id }, select: { id: true } });
  if (!c) return NextResponse.json({ error: "Not one of your courses." }, { status: 404 });
  try {
    if (b.action === "move") {
      const data: Record<string, unknown> = {};
      if (typeof b.type === "string" && b.type.trim()) data.courseType = b.type.trim().slice(0, 60);
      if (b.semester !== undefined) { const n = b.semester === "" || b.semester === null ? null : Number(b.semester); if (n !== null && (!Number.isInteger(n) || n < 1 || n > 12)) throw new Error("Semester must be 1–12."); data.semesterNumber = n; }
      await prisma.course.update({ where: { id: c.id }, data });
      // Moved by hand: content sync never moves this course's semester again.
      if (b.semester !== undefined) await (await import("../../../../lib/batchFlow")).markManual(c.id, user.id);
      await writeAuditLog({ actorUserId: user.id, action: "BATCH_BOARD_MOVE", entityType: "Course", entityId: c.id, metadata: { ...data } as never });
      return NextResponse.json({ ok: true, message: "Moved." });
    }
    if (b.action === "owner") return NextResponse.json({ ok: true, message: await setOwner(user.id, c.id) });
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
