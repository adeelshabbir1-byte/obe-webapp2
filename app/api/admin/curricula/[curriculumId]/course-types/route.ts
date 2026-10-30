import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { canEditMeta } from "../../../../../../lib/curriculumLibraryData";
import { COURSE_TYPES } from "../../../../../../lib/courseTypes";
import { withErrors } from "../../../../../../lib/apiHandler";

// PATCH { updates: [{ id, category?, creditHours?, semesterNumber?, domain? }] } — course types, credit hours, semester
// and track of a master curriculum's courses, saved together.
async function PATCH_handler(req: NextRequest, { params }: { params: { curriculumId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const c = await prisma.masterCurriculum.findUnique({ where: { id: params.curriculumId }, select: { id: true, chairmanId: true } });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canEditMeta(user, c))) return NextResponse.json({ error: "Only the Super User (official curricula) or the owning institute can change this." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const ups: Record<string, unknown>[] = Array.isArray(b.updates) ? b.updates.slice(0, 400) : [];
  const keys = new Set(COURSE_TYPES.map((t) => t.key));
  const own = new Set((await prisma.masterCourse.findMany({ where: { masterCurriculumId: c.id }, select: { id: true } })).map((x) => x.id));
  let n = 0;
  for (const u of ups) {
    const id = String(u.id || "");
    if (!own.has(id)) continue;
    const data: Record<string, unknown> = {};
    if (u.category !== undefined) { if (!keys.has(String(u.category))) return NextResponse.json({ error: `Unknown course type "${u.category}".` }, { status: 400 }); data.category = String(u.category); }
    if (u.creditHours !== undefined) { const ch = Number(u.creditHours); if (!Number.isInteger(ch) || ch < 0 || ch > 12) return NextResponse.json({ error: "Credit hours must be 0–12." }, { status: 400 }); data.creditHours = ch; }
    if (u.semesterNumber !== undefined) { const s = u.semesterNumber === null || u.semesterNumber === "" ? null : Number(u.semesterNumber); if (s !== null && (!Number.isInteger(s) || s < 1 || s > 12)) return NextResponse.json({ error: "Semester must be 1–12 (or empty)." }, { status: 400 }); data.semesterNumber = s; }
    if (u.domain !== undefined) data.domain = String(u.domain || "").trim().slice(0, 80) || null;
    if (Object.keys(data).length) { await prisma.masterCourse.update({ where: { id }, data }); n++; }
  }
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_COURSE_TYPES_UPDATED", entityType: "MasterCurriculum", entityId: c.id, metadata: { changed: n } });
  return NextResponse.json({ ok: true, message: `${n} course(s) saved.` });
}
export const PATCH = withErrors(PATCH_handler);
